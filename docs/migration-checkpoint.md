# Migration checkpoint — specification v1.1

Independent shallow repository reconstructed from the current committed snapshot. No operational files, uncommitted changes, shared object stores or historical commits were copied. All work is local.

## 2026-10-07 — Storyboard client retries

VideoPreviewGenerator sends an operation identity and keeps it after failed HTTP,
lost responses or invalid adaptation data. Every adaptation failure is explicit;
none silently starts a raw-script recording. Monthly limits trigger the existing
quota callback; minute throttling does not masquerade as a monthly quota failure.
The adaptation response must be bounded text that produces slides before the
interaction completes. Duplicate clicks start one request and one recording.

Successful adaptation is reused for recording retries and Regenerate within the
same modal interaction. Each local recording attempt still consumes its existing
daily render allowance. Account/authentication, script, generation, title or
language changes invalidate the interaction, stop its recording and ignore late
results. Closing/unmounting also prevents late callbacks or a new upload.
Identity and adapted text are memory-only; closing/reloading starts a new interaction.

The actual component's deterministic hook/HTTP/MediaRecorder/storage harness has
33 scenarios. The PostgreSQL control test composes that component with the actual
API, factory, mock provider adapter, ledger and generation table: a history-write
failure and lost successful response recover one inference/settlement/history row,
then an empty recording retries locally without another adaptation request.
This does not test a real browser codec, operational authentication or video upload.
The existing video-upload path is not made idempotent by this change; its save
acknowledgement and failure behavior remain a separate local pending deliverable.

## 2026-10-07 — Storyboard history replay

An authenticated Storyboard operation with an Idempotency-Key now saves one
generation under a user-scoped deterministic primary key. The stored digest
binds the full script and normalized language, including input beyond the
4,000-character prompt limit. Replaying a committed result precedes quota and
minute-throttle checks, so a free user's one monthly Video Tips slot does not
block recovery after a lost HTTP response. Conflicting input returns 409;
storage uncertainty returns a bounded error. Concurrent inserts recover the
committed row without overwriting it. Requests without a key retain their
existing behavior. No schema change or operational recovery permission is added.

Offline route tests cover exhausted quotas, throttling, changed input, invalid
keys, storage failure and late insert acknowledgement. A real designated
PostgreSQL test exercises competing inserts; a second test composes the actual
route, task factory, adapter with mock transport, ledger and generation table
to check one inference/settlement/history effect after lost responses and a
failed initial history write. Authentication and output remain synthetic.

The browser caller still needs retry identity and explicit failure handling.
This does not make quotas atomic across distinct operations, guarantee recovery
after deletion of history, or complete operational acceptance. Stored history
is a business replay result, never evidence of original coordinator ownership.

## 2026-10-07 — Predictor request retries

Predictor now sends the existing operation identity and retains it after a lost
response, HTTP failure or malformed result. It validates prediction and baseline
fields before finishing the interaction. Rapid duplicate clicks share one request;
changed form inputs get a different identity on the next attempt. Late responses
for changed inputs, accounts or languages are ignored. Known plan/channel/video
errors retain their user messages; other failures show a bounded retry message.
The identity is browser memory only. The actual API and synthetic PostgreSQL ledger
test cover one model dispatch and one settlement after response loss; changed user
input or derived video context fails closed without another model dispatch.
YouTube data acquisition still precedes server replay and is synthetic in tests.
Operational authentication, real providers and acceptance remain pending.

## 2026-10-07 — Calendar suggestion retries

The calendar client now sends the existing operation identity and retains it after
an HTTP failure, lost response or malformed result. Rapid duplicate clicks share
one request; a successful interaction starts a new identity next time. Failures
show a retry action instead of a misleading empty-results message. Changing the
account or language discards the previous interaction and ignores its late result.
Identity is held in browser memory only and does not survive a page reload.
The PostgreSQL control test covers the actual calendar route after a lost response:
unchanged context recovers one result with one synthetic dispatch and settlement;
changed derived context fails closed without dispatch. Calendar-entry writes,
operational authentication, real providers and acceptance remain outside this change.

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
An additional offline composition test executes the actual checkout route
with the migration payment facade, exact synthetic customer and session
fixtures, and a synthetic price. It returns only an `example.invalid` URL and
records zero network or external module attempts. The nine-suite offline web
verification passes. This is route/facade integration, not a live charge or
browser checkout acceptance.
The same composition test now exercises the cancellation route: a synthetic
active subscription is marked for period-end cancellation only after matching
the exact simulated provider responses. An unconfigured customer returns an
error and causes no additional local subscription write. The nine offline
web suites pass; no real subscription was changed.
The local verifier now records the exact Git commit and whether the worktree
changed before or during its run, including non-ignored untracked files. An
unexpected suite-command error produces a failed JSON receipt alongside the
log. A temporary invalid-command injection
confirmed this behavior and was restored; the normal offline suites pass.
The guarded HTTP smoke now has six checks. Authenticated cancellation with the
synthetic fixture account returns 400 before any payment facade operation
because it has no provider customer ID. The temporary loopback server was
stopped and port 4300 was confirmed closed. This is not a real cancellation.

The Video Tips screen now distinguishes a downloadable recording from an
acknowledged account save. Failed or malformed upload acknowledgements expose
Retry saving; the same binary Blob and retry key are reused without another AI
request, recording or daily render allowance. Account/input changes and closing
discard late UI acknowledgements. IndexedDB caching is a separate best effort.
The upload API authenticates the account, compares exact bytes/title/MIME on
retry and atomically creates/prunes previews under a PostgreSQL account-row
lock. Existing callers without a key remain supported. Replay is bounded by
retention of the last three previews and browser interaction memory; it does
not provide permanent deduplication after deletion or reload. Synthetic tests
exercise the actual component/API with designated PostgreSQL, concurrent saves,
lost acknowledgements and pruning rollback. They do not validate browser codecs,
operational authentication, production storage or real model acceptance.

The Dashboard's saved-video history uses an account-scoped controller. A failed
or malformed list is shown with Retry video list, including free accounts; it
does not masquerade as empty history. Refresh failures retain confirmed rows.
Binary open/download validate responses before creating owned object URLs;
URLs are released on replacement, close or account/unmount transitions. Late
responses cannot repopulate another account or reopen a closed player. Delete
keeps a row until 204 or 404 confirms absence and refreshes the list; a lost
acknowledgement can be retried. Confirmed new saves supersede older reads.
Synthetic hook/HTTP tests and the actual list/binary/delete routes with designated
PostgreSQL exercise these behaviors. This does not establish real browser codec,
operational authentication or production-cache acceptance.

Generation history in Dashboard now has account/email/auth-scoped paging,
explicit loading/errors and retry of the failed page. Refresh replaces the first
page and resets the cursor; failed loads preserve confirmed rows and do not
advance it. Duplicate clicks coalesce and overlapping offset rows are deduplicated.
The server rejects malformed/excessive page values before storage, returns a
bounded storage error and orders equal dates by id. Legacy unknown usage remains
null; non-string input metadata is omitted only from UI labels, not stored content.
Initial failure does not present first-generation or empty-filter guidance. The
filter describes loaded rows, not the full library. Synthetic tests include the
original route and designated PostgreSQL. Offset pages are not a fixed snapshot
under concurrent inserts/deletes; Refresh is available to obtain a newer view.
Operational authentication, browser behavior and real model quality are pending.


## Dashboard statistics reads

Statistics and plan reads now validate HTTP/JSON, account email, counters and subscription shape before rendering. Initial failure shows a retry screen instead of free-plan/zero defaults; failed refresh retains a labelled last confirmed reading. Account/auth changes hide prior statistics before effects run, stale reads are discarded, retries coalesce, and post-onboarding or cancellation refresh callbacks remain scoped to their original account. Successful cancellation triggers an actual statistics read rather than an optimistic subscription update. The original statistics API bounds storage failures to503. These are local reading guarantees; onboarding, billing and YouTube action callbacks and operational authentication/payment acceptance remain separate pending work.
