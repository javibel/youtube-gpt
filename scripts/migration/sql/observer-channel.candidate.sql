-- Local review candidate. Apply ONLY to the newly owned synthetic fixture.
-- Existing role creation/configuration/activation is deliberately separate.
CREATE TABLE ytv_ai_v1.observer_requests (
 request_id text PRIMARY KEY CHECK(request_id ~ '^obs_[A-Za-z0-9_-]{16,96}$'),
 nonce text NOT NULL UNIQUE CHECK(nonce ~ '^[a-f0-9]{64}$'),
 actor text NOT NULL CHECK(actor ~ '^admin_[a-f0-9]{64}$'),
 request_wire text NOT NULL CHECK(octet_length(request_wire)<=65536),
 request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
 responder text NOT NULL,
 deadline_ms bigint NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','delivered','cancelled','uncertain','complete')),
 execution_claim jsonb,
 CHECK(execution_claim IS NULL OR (jsonb_typeof(execution_claim)='object' AND execution_claim ?& ARRAY['requestId','nonce','requestDigest','bindingDigest'] AND execution_claim->>'requestId'=request_id AND execution_claim->>'nonce'=nonce AND execution_claim->>'requestDigest'=request_digest AND execution_claim->>'bindingDigest' ~ '^[a-f0-9]{64}$') IS TRUE)
);
CREATE TABLE ytv_ai_v1.observer_results (
 request_id text PRIMARY KEY REFERENCES ytv_ai_v1.observer_requests(request_id),
 result_wire text NOT NULL CHECK(octet_length(result_wire)<=65536),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION ytv_ai_v1.guard_observer_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME='observer_results' THEN RAISE EXCEPTION 'observer immutable'; END IF;
 IF (NEW.request_id,NEW.nonce,NEW.actor,NEW.request_wire,NEW.request_digest,NEW.responder,NEW.deadline_ms)
  IS DISTINCT FROM (OLD.request_id,OLD.nonce,OLD.actor,OLD.request_wire,OLD.request_digest,OLD.responder,OLD.deadline_ms)
  OR OLD.execution_claim IS NOT NULL AND NEW.execution_claim IS DISTINCT FROM OLD.execution_claim
  OR OLD.execution_claim IS NULL AND NEW.execution_claim IS NOT NULL AND OLD.state<>'delivered'
  OR NOT (NEW.state=OLD.state OR OLD.state='pending' AND NEW.state IN ('delivered','cancelled') OR OLD.state='delivered' AND NEW.state IN ('complete','cancelled','uncertain'))
 THEN RAISE EXCEPTION 'observer immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER observer_request_immutable BEFORE UPDATE OR DELETE ON ytv_ai_v1.observer_requests FOR EACH ROW EXECUTE FUNCTION ytv_ai_v1.guard_observer_immutable();
CREATE TRIGGER observer_result_immutable BEFORE UPDATE OR DELETE ON ytv_ai_v1.observer_results FOR EACH ROW EXECUTE FUNCTION ytv_ai_v1.guard_observer_immutable();
REVOKE ALL ON ytv_ai_v1.observer_requests,ytv_ai_v1.observer_results FROM PUBLIC;
GRANT SELECT ON ytv_ai_v1.observer_requests,ytv_ai_v1.observer_results TO ytv_ai_reader;
GRANT SELECT,INSERT,UPDATE ON ytv_ai_v1.observer_requests TO ytv_ai_executor;
GRANT SELECT,INSERT ON ytv_ai_v1.observer_results TO ytv_ai_executor;
