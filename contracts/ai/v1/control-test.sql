-- Additive, isolated TEST schema. The runner must verify database identity first.
CREATE SCHEMA IF NOT EXISTS ytv_ai_test_v1;
CREATE TABLE IF NOT EXISTS ytv_ai_test_v1.revisions (
 revision text PRIMARY KEY, contract_version text NOT NULL CHECK(contract_version='1.0'),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'), actor text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ytv_ai_test_v1.active_revision (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 revision text NOT NULL REFERENCES ytv_ai_test_v1.revisions(revision)
);
CREATE TABLE IF NOT EXISTS ytv_ai_test_v1.switch_events (
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 previous_revision text, revision text NOT NULL REFERENCES ytv_ai_test_v1.revisions(revision),
 actor text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ytv_ai_test_v1.budgets (
 budget_id text PRIMARY KEY, currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 limit_micros bigint NOT NULL CHECK(limit_micros>=0),
 reserved_micros bigint NOT NULL DEFAULT 0 CHECK(reserved_micros>=0),
 settled_micros bigint NOT NULL DEFAULT 0 CHECK(settled_micros>=0),
 blocked boolean NOT NULL DEFAULT false,
 CHECK(reserved_micros+settled_micros<=limit_micros)
);
CREATE TABLE IF NOT EXISTS ytv_ai_test_v1.runs (
 run_id text PRIMARY KEY, request_id text NOT NULL UNIQUE, task_type text NOT NULL,
 request_fingerprint text NOT NULL,
 idempotency_key text, revision text NOT NULL REFERENCES ytv_ai_test_v1.revisions(revision),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 status text NOT NULL CHECK(status IN ('running','completed','incomplete','refused','failed','cancelled','uncertain')),
 usage jsonb, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 UNIQUE(task_type,idempotency_key)
);
CREATE TABLE IF NOT EXISTS ytv_ai_test_v1.reservations (
 run_id text PRIMARY KEY REFERENCES ytv_ai_test_v1.runs(run_id),
 budget_id text NOT NULL REFERENCES ytv_ai_test_v1.budgets(budget_id),
 amount_micros bigint NOT NULL CHECK(amount_micros>=0),
 state text NOT NULL CHECK(state IN ('reserved','settled','uncertain')),
 actual_micros bigint CHECK(actual_micros>=0)
);
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='ytv_ai_test_reader') THEN CREATE ROLE ytv_ai_test_reader NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='ytv_ai_test_activator') THEN CREATE ROLE ytv_ai_test_activator NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='ytv_ai_test_executor') THEN CREATE ROLE ytv_ai_test_executor NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA ytv_ai_test_v1 TO ytv_ai_test_reader,ytv_ai_test_activator,ytv_ai_test_executor;
GRANT SELECT ON ALL TABLES IN SCHEMA ytv_ai_test_v1 TO ytv_ai_test_reader;
GRANT SELECT,INSERT ON ytv_ai_test_v1.revisions,ytv_ai_test_v1.switch_events TO ytv_ai_test_activator;
GRANT SELECT,INSERT,UPDATE ON ytv_ai_test_v1.active_revision TO ytv_ai_test_activator;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ytv_ai_test_v1 TO ytv_ai_test_activator;
GRANT SELECT ON ytv_ai_test_v1.revisions TO ytv_ai_test_executor;
-- Admission and activation share a transaction advisory lock in the store;
-- executors do not need permission to update the active configuration.
GRANT SELECT ON ytv_ai_test_v1.active_revision TO ytv_ai_test_executor;
GRANT SELECT,INSERT ON ytv_ai_test_v1.runs,ytv_ai_test_v1.reservations TO ytv_ai_test_executor;
REVOKE UPDATE ON ytv_ai_test_v1.runs,ytv_ai_test_v1.reservations FROM ytv_ai_test_executor;
GRANT UPDATE(status,usage,finished_at) ON ytv_ai_test_v1.runs TO ytv_ai_test_executor;
GRANT UPDATE(state,actual_micros) ON ytv_ai_test_v1.reservations TO ytv_ai_test_executor;
GRANT SELECT,UPDATE ON ytv_ai_test_v1.budgets TO ytv_ai_test_executor;
