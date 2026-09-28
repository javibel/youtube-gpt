# Portable contracts 1.0 — local preparation

This package contains no provider SDK, secret material or business integrations. `core.cjs` supplies an extensible registry and AI request/result validation. `coding.cjs` defines the separate coding executor. Only simulated adapters are registered by the tests; existing application routes do not import this package yet.

## Configuration and snapshots

Resolution uses an authorized task exception, then an authorized agent exception, then the active profile's explicit task assignment. Ambiguous exceptions, disabled providers, missing models, unsupported executors/capabilities and hidden fallback are rejected. The caller must obtain exception authorization and the agent identity from trusted control configuration, never from model output or user-supplied documents.

Each call receives a frozen request and configuration snapshot. Deadline expiry aborts the adapter signal, preserves unknown consumption, and never retries automatically. Cancellation before dispatch prevents adapter invocation. A provider adapter must actually honor the signal; the core cannot stop a remote operation that ignores cancellation.

Results preserve incomplete/refused/cancelled states, provenance, source references and separate input/output/cache/tool usage. Unknown metrics remain null. Errors expose safe category messages. Unexpected adapter rejection is uncertain and non-retryable. Error policy metadata is not an automatic retry loop.

## Structured output

Six Draft 7 schemas describe interchange structure. The runtime additionally checks cross-field capabilities, permissions, usage currency and tariff provenance. The task output schema subset supports object/array/scalar types, explicit properties, required fields, boolean additionalProperties, item schemas, scalar enums and basic bounds. Unsupported keywords are rejected rather than silently ignored. This is deliberately not a general-purpose implementation of every JSON Schema keyword.

Regenerate the schema files with `node contracts/ai/v1/build-schemas.cjs`, then refresh the synchronization manifest. The TypeScript declarations accompany the CommonJS modules. Core tests are executable using Node without provider dependencies.

## Durable control in the test database

`control-store.cjs` accepts a trusted, role-bound transaction adapter; it never creates a connection. `control-test.sql` is an additive isolated test schema, not a production migration. The database test validates the exact synthetic database and physical data directory before applying it.

Reader, activator and executor roles are NOLOGIN test roles. Configuration revisions and execution snapshots cannot be rewritten by their runtime roles. Activation checks the expected previous revision. Activation and admission share a transaction advisory lock. Admission reads the active revision, records its snapshot and reserves budget in the same transaction. Repeated operation identities reuse the existing run; changed input is rejected.

The reader-only `metrics({from,to})` method aggregates admitted runs by pinned provider, revision, task type, optional agent identity and budget currency. It never adds micro-costs from different currencies. It returns run outcomes, settled cost (`knownCostMicros`), held reservations, separately reported cost on uncertain reservations, the count of held runs without a reported cost, and the number and p95 of finished-run latency samples for the selected UTC interval. Reported unsettled cost is evidence to investigate, not settled spend: an overrun retains its reservation and blocks its budget. A p95 from very few samples is not a reliable comparison. Micro-cost totals are decimal strings to retain bigint precision. It does not return prompts, results or principals. Unsettled reservations must not be presented as zero-cost executions. The additive `agent_id` column is for this isolated test ledger; historical rows without it remain grouped under `null`.

The application caller must generate globally scoped request/idempotency identities and bind budget groups and runtime roles to authenticated business context. These must never be accepted unchecked from model output. No public control endpoint is implemented here.

Unknown cost retains the reservation. Known cost releases the unused portion once. An overrun blocks further admissions for that budget; unblocking requires an explicit reconciliation procedure, not an automatic retry. There is no claim that a post-call ledger can prevent a provider exceeding a request limit: real adapters must perform conservative preflight estimates and enforce provider limits before dispatch.

## Coding boundary

`task-runner.cjs` composes durable admission, execution of the pinned adapter and reconciliation. Admission time counts against the deadline. Existing operations return a run reference without dispatching again; the caller retrieves business output from its own history. If reconciliation fails after dispatch, the error is uncertain and never triggers another provider call. Raw registry methods are conformance primitives and do not reserve budgets themselves.

Coding jobs name a registered repository, base revision, explicit relative file scope, permission flags and exact command argument vectors. Deployments, communications and direct operational commands are disabled during local preparation. Results outside the allowed file/command scope are rejected. Partial work can preserve a portable checkpoint without becoming a completed actionable result.

The simulated adapter does not execute commands or edit files. Physical path validation, writer leases, actual CLI permissions, command auditing and trusted command receipts belong to the real coding integration. A declared test receipt does not by itself prove a command ran.

## Status

This is the phase-1 foundation. Business-route adapters, durable dispatch/recovery integration, queued-job handling and real provider comparisons remain separate work. No Anthropic/OpenAI/Codex/Claude operation, deployment or production activation is performed by these tests.

Durable output recovery (2026-09-15): the identified local test schema now stores immutable canonical results in the same transaction as reconciliation. Validated admission replays return a saved result, including incomplete/refused status and unknown cost, without provider execution. Runs interrupted before output persistence remain unresolved and cannot be silently retried. A hashed authenticated principal scope participates in the operation fingerprint; sharing a budget does not permit cross-principal replay. The execution role cannot update/delete saved results. This is still the isolated test schema, not a production migration. Most HTTP/business callers have not yet supplied stable retry identities; output recovery requires the same request/idempotency identity.
# One-shot dispatch claims

`claimDispatch(originalRequest, context)` is an executor-only opt-in boundary
before external dispatch. It rechecks the original admission fingerprint,
request identity, principal/budget context, active reservation, unblocked budget
and remaining deadline. The context includes a SHA-256 of the trusted dispatch
binding, not prompts or credentials. The digest and timestamp are stored once
on the existing run; no parallel reservation or approval table is introduced.

Concurrent claims serialize with reconciliation. A fresh store instance, changed
digest or lost commit acknowledgement cannot authorize a second claim. The SQL
trigger rejects clearing/replacing the recorded marker. Unknown dispatch must
be reconciled, never retried automatically. A claim reserves the right to send;
it is not evidence that a provider actually received the request. Failure after
claiming can conservatively leave a consumed claim without any provider call.

`task-runner.runClaimed` is the opt-in execution path for a request admitted
before it was queued. It uses `claimDispatch` to recover the pinned snapshot
and remaining deadline, then runs that snapshot and reconciles the result.
It never creates a new admission. A failed or ambiguous claim cannot reach the
adapter, and a completed retry uses the normal `run` replay path to read the
stored result. The caller must supply a trusted dispatch digest bound to its
deferred execution. A waiting task that has **not** been admitted still uses
normal `run` at start, so it selects the profile active then. The runner also
subtracts claim acknowledgement time from the remaining deadline. Tests use
only the identified synthetic PostgreSQL schema.
