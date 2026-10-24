-- Operational candidate resources. Inert SQL; applying it requires explicit release approval.
-- The deployment runner must bind the original administrator connection to the approved database.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
CREATE SCHEMA ytv_ai_v1;
CREATE TABLE ytv_ai_v1.revisions (
 revision text PRIMARY KEY, contract_version text NOT NULL CHECK(contract_version='1.0'),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'), actor text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ytv_ai_v1.active_revision (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 revision text NOT NULL REFERENCES ytv_ai_v1.revisions(revision)
);
CREATE TABLE ytv_ai_v1.switch_events (
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 previous_revision text, revision text NOT NULL REFERENCES ytv_ai_v1.revisions(revision),
 actor text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ytv_ai_v1.budgets (
 budget_id text PRIMARY KEY, currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 limit_micros bigint NOT NULL CHECK(limit_micros>=0),
 reserved_micros bigint NOT NULL DEFAULT 0 CHECK(reserved_micros>=0),
 settled_micros bigint NOT NULL DEFAULT 0 CHECK(settled_micros>=0),
 blocked boolean NOT NULL DEFAULT false,
 CHECK(reserved_micros+settled_micros<=limit_micros)
);
CREATE TABLE ytv_ai_v1.runs (
 run_id text PRIMARY KEY, request_id text NOT NULL UNIQUE, task_type text NOT NULL,
 request_fingerprint text NOT NULL,
 idempotency_key text, revision text NOT NULL REFERENCES ytv_ai_v1.revisions(revision),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 status text NOT NULL CHECK(status IN ('running','completed','incomplete','refused','failed','cancelled','uncertain')),
 usage jsonb, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 UNIQUE(task_type,idempotency_key)
);
CREATE TABLE ytv_ai_v1.reservations (
 run_id text PRIMARY KEY REFERENCES ytv_ai_v1.runs(run_id),
 budget_id text NOT NULL REFERENCES ytv_ai_v1.budgets(budget_id),
 amount_micros bigint NOT NULL CHECK(amount_micros>=0),
 state text NOT NULL CHECK(state IN ('reserved','settled','uncertain')),
 actual_micros bigint CHECK(actual_micros>=0)
);
ALTER TABLE ytv_ai_v1.runs ADD COLUMN IF NOT EXISTS dispatch_digest text CHECK(dispatch_digest ~ '^[a-f0-9]{64}$');
ALTER TABLE ytv_ai_v1.runs ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
ALTER TABLE ytv_ai_v1.runs ADD COLUMN IF NOT EXISTS agent_id text;
CREATE TABLE ytv_ai_v1.results (
 run_id text PRIMARY KEY REFERENCES ytv_ai_v1.runs(run_id) ON DELETE CASCADE,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND payload->>'runId'=run_id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE ROLE ytv_ai_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD NULL;
CREATE ROLE ytv_ai_activator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD NULL;
CREATE ROLE ytv_ai_executor LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD NULL;
DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO ytv_ai_reader,ytv_ai_activator,ytv_ai_executor',current_database()); END $$;
GRANT USAGE ON SCHEMA ytv_ai_v1 TO ytv_ai_reader,ytv_ai_activator,ytv_ai_executor;
GRANT SELECT ON ALL TABLES IN SCHEMA ytv_ai_v1 TO ytv_ai_reader;
GRANT SELECT,INSERT ON ytv_ai_v1.revisions,ytv_ai_v1.switch_events TO ytv_ai_activator;
GRANT SELECT,INSERT,UPDATE ON ytv_ai_v1.active_revision TO ytv_ai_activator;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ytv_ai_v1 TO ytv_ai_activator;
GRANT SELECT ON ytv_ai_v1.revisions TO ytv_ai_executor;
-- Admission and activation share a transaction advisory lock in the store;
-- executors do not need permission to update the active configuration.
GRANT SELECT ON ytv_ai_v1.active_revision TO ytv_ai_executor;
GRANT SELECT,INSERT ON ytv_ai_v1.runs,ytv_ai_v1.reservations TO ytv_ai_executor;
GRANT SELECT,INSERT ON ytv_ai_v1.results TO ytv_ai_executor;
REVOKE UPDATE,DELETE ON ytv_ai_v1.results FROM ytv_ai_executor;
REVOKE UPDATE ON ytv_ai_v1.runs,ytv_ai_v1.reservations FROM ytv_ai_executor;
GRANT UPDATE(status,usage,finished_at,dispatch_digest,dispatched_at) ON ytv_ai_v1.runs TO ytv_ai_executor;
CREATE OR REPLACE FUNCTION ytv_ai_v1.prevent_dispatch_rewrite() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.dispatch_digest IS NOT NULL AND (NEW.dispatch_digest IS DISTINCT FROM OLD.dispatch_digest OR NEW.dispatched_at IS DISTINCT FROM OLD.dispatched_at) THEN
  RAISE EXCEPTION 'Dispatch receipt cannot be replaced or cleared' USING ERRCODE='42501';
 END IF;
 IF (NEW.dispatch_digest IS NULL) <> (NEW.dispatched_at IS NULL) THEN
  RAISE EXCEPTION 'Dispatch receipt requires both fields' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER ytv_ai_test_dispatch_once
BEFORE UPDATE OF dispatch_digest,dispatched_at ON ytv_ai_v1.runs
FOR EACH ROW EXECUTE FUNCTION ytv_ai_v1.prevent_dispatch_rewrite();
GRANT UPDATE(state,actual_micros) ON ytv_ai_v1.reservations TO ytv_ai_executor;
REVOKE UPDATE ON ytv_ai_v1.budgets FROM ytv_ai_executor;
GRANT SELECT ON ytv_ai_v1.budgets TO ytv_ai_executor;
GRANT UPDATE(reserved_micros,settled_micros,blocked) ON ytv_ai_v1.budgets TO ytv_ai_executor;
CREATE OR REPLACE FUNCTION ytv_ai_v1.prevent_executor_unblock() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.blocked AND NOT NEW.blocked AND NOT pg_catalog.pg_has_role(current_user,'ytv_ai_activator','USAGE') THEN
  RAISE EXCEPTION 'Executor cannot clear a budget hold' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER ytv_ai_test_budget_hold
BEFORE UPDATE OF blocked ON ytv_ai_v1.budgets
FOR EACH ROW EXECUTE FUNCTION ytv_ai_v1.prevent_executor_unblock();

REVOKE ALL ON SCHEMA ytv_ai_v1 FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA ytv_ai_v1 FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA ytv_ai_v1 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ytv_ai_v1 FROM PUBLIC;
-- Credentials are provisioned separately through the original secret manager.
-- This file contains no passwords, budgets, active revisions, or restored runs.
COMMIT;
