# Migration checkpoint — specification v1.1

Independent shallow repository reconstructed from the current committed snapshot. No operational files, uncommitted changes, shared object stores or historical commits were copied. All work is local.

The migration config is ../migration-config.json relative to this repository. Test runtime directories are ../migration-runtime. PostgreSQL 17.11 now runs on the designated loopback endpoint; its data-directory identity was verified before test writes.

npm run migration:check validates the map. npm run migration:test runs offline fixtures. Normal npm startup/build/dashboard are blocked until legacy effects have tested simulation adapters. This is an entry-point guard, not an OS sandbox; do not invoke legacy scripts directly or disable npm lifecycle scripts to bypass it.

Push URL is disabled and a pre-push hook rejects pushes. No push was used to test this. Never add deployment remotes or activate Vercel during development.

Pending: trace remaining legacy external effects, complete functional baseline and clean client generation, enable controlled application runner only after effects are isolated.

## Offline payment boundary

lib/stripe.ts uses a migration-only facade with the existing Stripe types, without importing or constructing the Stripe SDK at runtime. Operations require validated configuration and exact synthetic argument fixtures. Unknown calls fail; checkout and portal redirects must use example.invalid. Webhook ingestion remains blocked rather than pretending to verify signatures. Eleven tests exercise this facade and the actual TypeScript entry without external effects. Together with isolation tests, the web suite has 38 passing cases. Targeted strict typechecking of lib/stripe.ts passes. This is not a full application typecheck or build, and normal startup remains blocked.

## Local database validation

The schema engine generated a baseline from the checked-in schema without a database connection. Its 55 application tables were created transactionally only after confirming the synthetic database identity and absence of application tables. User/defaults, uniqueness, session cascade and transaction rollback were verified through Prisma. A backup restored into another local database preserves tables, column definitions, indexes, 84 constraints and related synthetic user/session data. No production schema was inspected or changed; the SQL is not a production migration.

The full project typecheck passes with the independently copied Prisma 5.8 client whose schema SHA-256 matches the checked-in schema. Fresh Prisma CLI generation still fails with spawn EPERM in this execution environment. npm run migration:test:database is an opt-in test against the already prepared local database; it checks server identity before writing and never starts the application. The normal offline suite remains independent of PostgreSQL.

## Subsequent fresh-client verification

The user's external PowerShell execution logged successful Prisma 5.8 generation. Its final summary file did not appear, so completion of that entire wrapper is not assumed. The agent separately ran full typechecking and the five database contracts against the regenerated client; both passed. The historical copied-client qualification above therefore no longer applies to those new checks. Full Next build and route-level acceptance remain pending.

Twenty parser reference cases pass through the actual TypeScript helper in an offline VM. They verify JSON syntax behavior only, including fences, languages, nested values and malformed responses; they do not establish semantic output validation.

## Route-level reference and isolated authorization repair

Forty-one cases now execute the actual generation, checkout and cancellation handlers in an offline VM. Prompt builders and pricing are real source modules; authentication, database, provider transport and email are synthetic explicit dependencies. These are handler tests, not browser/end-to-end acceptance.

Generation tests reproduced two previous accounting bypasses: a session with an ID but no email, and a session whose user no longer exists, both reached the provider without account quotas or persistence. The isolated route now rejects these sessions and mismatched session/database identity with 401 before provider access. Valid web/extension quota, prompt, continuation and truncation behavior remains covered. Strict full-project typechecking passes after the repair. No operational repository was changed.

## Current checkpoint — 2026-09-14

The full guarded web build now passes; earlier build/client-generation pending notes above are historical. Phase-1 portable contracts pass 37 core, 24 coding and 10 coordinated-runner cases in both copies. The real isolated PostgreSQL control suite passes 25 cases, including least-privilege checks, concurrent reservations and one provider dispatch across replay. Twenty portable files match the synchronization manifest. Strict contract declaration typechecking passes. Business-route wiring, production-grade control migrations and real provider comparisons are not complete. Continue phase 2 using simulated transports only. See the current local output report for the full status.

Phase-2 update: AB suggestions and best-time tips in the web copy now use the common runtime. Their suites pass 26 and 23 cases, respectively. Anthropic protocol tests pass 33, compatibility 16, server factory 7 and installer 4 checks. Real local control tests pass 28, including the actual AB route with PostgreSQL and simulated transport. Full guarded build passes after both routes. General startup and real SDK transport remain disabled; remaining routes and agents still await migration.

Current seven-route checkpoint: generate, chat, storyboard, background prompts, Analytics, AB suggestions and best-time tips use the common runtime. Their 163 route cases pass. The protected build and targeted TypeScript lint pass. Core 40, coding 24, coordinated runner 10 and real isolated control 31 cases pass. Protocol 34, compatibility 20, factory 7 and runtime 6 checks pass. Unknown canonical cost stays null; the legacy generation token column and durable output recovery remain integration debt. General startup, live providers and deployment remain disabled. Continue remaining phase-2 call sites.

## 2026-09-15 — Twelve web routes
Coach, bulk, calendar, predictor and retention now join the common runtime. Full protected build and route suites pass. SQL control has 33 passing cases, including budget ceiling/currency restrictions and overrun hold protection. Legacy history readers map ambiguous zero to null; exact ledger linkage is still pending. Seven history access/format tests pass. No live calls, deployment or general startup.

## 2026-09-15 — Seventeen web routes
Public/private SEO text and vision, revenue, audience and competitor insights now use the common runtime. Seventeen-route protected build passes. Service principals require explicit policy allowlist and budget authorization; namespace separation and identity cloning are tested. Public quota store failures and invalid receipts stop external work. Live bootstrap and evaluation remain pending.

## 2026-09-15 — Twenty-one web routes
Audit, thumbnail preview, optimization and thumbnail generation now use the common runtime. Protected full build, reference/access suites and targeted lint pass. Image upload failure cannot return a temporary uncomposed image as success. All writes, media operations and providers in route tests are synthetic; actual image rendering has not been visually verified.

## 2026-09-15 — Web inventory centralized
All 32 web inventory references across 23 routes and 4 libraries use the common boundary. Protected full build, reference/adapters suites and 33 SQL tests pass. The new static regression guard checks 299 business files. Library suite: 23; scheduled content/image suite: 29; compatibility: 22. No live communication, publication, provider call or general startup. Agent migration, durable outputs/history and later phases remain pending.

## 2026-09-15 — OpenAI Responses adapter
The second real protocol adapter is implemented with injected synthetic transport, verified fixture catalog and bounded quote. 41 adapter checks plus 6 shared-runner configuration switch tests pass. Ordinary input/cache read/cache write buckets match the Anthropic adapter without double counting. No real account model, API transport, pricing or quality claim is made. Official Responses/structured-output/cache documentation was opened. No live SDK/bootstrap is installed; general startup remains disabled. Next: durable output recovery and remaining agent caller/integration coverage.

## 2026-09-15 — Durable canonical outputs
37 local PostgreSQL cases pass. Canonical output is stored atomically with reconciliation and is immutable to the executor. Fresh runner instances recover completed, incomplete and unknown-cost output without dispatch or double settlement, including lost commit acknowledgements. Authenticated principal hashes bind replay independently of shared budgets. Portable runner now has 11 cases; all contract/adapter suites and strict declarations pass in both copies. Full protected web build, web reference/access suites and agent reference suites pass. Stable HTTP retry identities and full business-effect recovery remain pending; an interruption before result persistence still requires reconciliation rather than automatic re-execution.

## 2026-09-15 — HTTP operation identities
Twelve read-oriented routes forward an optional Idempotency-Key to the trusted factory. Valid keys are scoped by principal and task and separated from random identities. Factory has 15 passing cases. The actual AB route + PostgreSQL integration proves repeated identical input returns the saved variants with one dispatch and settlement; changed input with the same key is rejected. Full protected build and existing route reference suites pass. Frontend key generation, recovery when derived external input changes, and idempotent business writes/media/publications remain pending; this does not make whole business workflows replay-safe.

## 2026-09-27 — Synthetic payment redirects

The offline payment facade now accepts checkout and billing-portal redirect
fixtures only as HTTPS URLs on `example.invalid`, without embedded credentials
or a custom port. Fourteen payment checks and the full offline web migration
suite pass. This guards fixture behavior only; no Stripe operation or live
browser flow was exercised.
The expanded local verification initially stopped because the designated
PostgreSQL fixture was offline. After confirming the portable cluster's data
directory and loopback binding, it was started without installing a service.
The rerun passed all 12 suites, including synthetic database contracts and
the protected build. No operational database or Vercel deployment was used.
The guarded fixture server was then started only on 127.0.0.1:4300. The HTTP
smoke passed synthetic login, configured provider lookup, immutable replay,
and rejection of changed input under the same operation identity. The server
was stopped and the listener was confirmed closed. This does not cover
payments, other browser flows, live providers, or full product acceptance.
The same HTTP smoke now also confirms checkout fails before any payment call
when the guarded fixture has no synthetic price ID. Five checks pass; the
temporary listener is again closed. A successful checkout remains untested.
