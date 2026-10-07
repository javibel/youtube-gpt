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
# Dashboard onboarding acknowledgement (local implementation)

The Dashboard now scopes welcome reads, step saves, generated titles and clipboard callbacks to the current account. Failed reads expose retry instead of inventing step zero. A step changes or navigation occurs only after a valid acknowledgement for the original account. Absolute step writes advance monotonically; duplicate requests and late lower steps cannot reopen completion. POST retries repeat only the failed step, retaining a confirmed title in memory and never generating it again to repair persistence. Pending mutations coalesce; competing UI actions remain disabled. Storage failures are bounded503, absent accounts404 and malformed/noninteger steps400.

Generation transport failures remain uncertain: there is no automatic generation replay or claim of generic-generation idempotency. The UI directs users to history before another generation. Reloading clears the in-memory title; persisted onboarding steps and stored generation history remain the sources for resuming. This block does not validate operational authentication, real models, quota reservation, billing/YouTube callbacks or human acceptance. The designated synthetic PostgreSQL and protected build verify local behavior only.


# Dashboard YouTube connection acknowledgement (local implementation)

Channel, growth, points and daily ideas now use an account-scoped hook with explicit HTTP/shape/identity validation and retries. Unknown or failed reads no longer pretend that the channel is disconnected. A failed refresh retains labelled last-confirmed data; cached channel data is labelled as saved data. Detail failures retain their confirmed values and retry only failing endpoints. Switching account/auth hides all previous data before effects; late reads/deletes and callbacks cannot change the new account. A new channel ID clears previous details before reading again. OAuth URL notices request verification rather than assert successful connection.

Disconnect coalesces clicks and requires a valid acknowledgement before clearing channel, growth and ideas. A lost acknowledgement can repeat the account-scoped deleteMany on an already absent token row. Late channel/detail reads cannot resurrect a confirmed disconnection. All four original routes bound storage errors and identify the authenticated account in successful responses; secrets are never returned to the hook.

Tests use only synthetic cached tokens, snapshots, daily ideas and HTTP/hook fixtures. No real OAuth, YouTube requests, token refresh or provider calls run. Disconnect deletes the local token record; it does not revoke Google consent. Snapshot/idea storage is scoped by account and does not identify the source channel, so accuracy across reconnecting a different channel remains an operational data dependency. Cache freshness, Google authentication, remote revocation, real quotas and operational/human acceptance remain unverified.


## Dashboard billing actions, local only — 2026-10-07

The billing hook validates HTTP/JSON and account identity before redirect, cancellation acknowledgement or subscription refresh. Concurrent clicks share one action; conflicting actions are blocked. Old account/auth/email callbacks cannot act, refresh or redirect. Cancellation requires explicit period-end acknowledgement; confirmed provider cancellation is reconciled after a lost response or failed local write and repeat requests return the same confirmed outcome. Sync distinguishes confirmed absence from failure and refreshes stored statistics without delayed browser reload. Errors remain visible with explicit cancel/sync retry.

Checkout accepts only the existing facade's simulated HTTPS example.invalid/checkout URL and mode. It cannot navigate to Stripe. Failed/unconfirmed checkout never automatically retries and warns to check subscription before starting another payment; no durable checkout idempotency, cross-tab coordination, expiry or real payment acceptance is claimed. Confirmed links are reused only for the same plan/language within the current account scope. Existing pricing, currency, trial and provider-selection logic remain unchanged. Operational subscription ownership, multiple active subscriptions, Business price-to-plan reconciliation, webhooks and authentic credentials remain separate acceptance dependencies.

Validation uses the real hook/routes and PostgreSQL rows with the original strictly matched payment facade. No actual Stripe calls, payment, browser navigation or models execute. Initial database fixture failed because VM-realm argument prototypes did not match the facade's exact comparison; original routes now compile in the same Node realm, retaining that guard.

## Generic generation API business replay — 2026-10-07

An optional Idempotency-Key now scopes the common task operation and an existing Generation primary key to the authenticated account. The retained history binds the template, all caller input strings in stable field order, and effective language. Authentication is checked before reading history; a matching retained result returns before quotas, throttle, channel refresh or model execution. Continuation replay returns the original delta and truncation flag while stored output remains combined. Changed input returns409 and malformed retained output503 without another task. History insertion uses the existing unique primary key; failed acknowledgement or concurrent insertion rereads the committed row instead of overwriting it. A missing/unconfirmed history write returns503.

The existing task factory, adapter, PostgreSQL ledger and history table verify one simulated inference/settlement and one history row after a failed first save and concurrent retries with lost acknowledgements. Another extension account has a distinct identity. This is business result replay, not coordinator recovery authority. No schema, dispatch claims, lost-owner recovery or cost/permission guards are weakened.

At this API-only checkpoint the browser generator, onboarding and extension sent keyless requests. Later browser screen and onboarding integration checkpoints are recorded below; extension still requires separate integration. Keyless callers preserve ordinary accounting and do not gain replay. Completed replay depends on retained history; no guarantee follows deletion of history. New operation quotas remain non-atomic across distinct requests. If persistence failed before history exists, changed channel context/plan/quota/configuration may prevent completing a retry; the original key must not be silently renewed to execute again. Existing 500-character field limit, including prior-content input, is unchanged. Real models, tariffs, quality, authentication and human acceptance remain unvalidated.
## Generic text generation screen: retained operation identity

The original GeneratePage now uses useGenericGeneration for generic text requests and continuations. A failed/invalid/uncertain response retains exactly one in-memory key and body; retry resumes that request, including its original continuation base. Confirmed content requires a nonempty string and explicit boolean partial flag. Each confirmation updates output and generation counters once; concurrent/competing clicks share one flight. Scope includes authenticated user ID/email, template, sorted input values and language. Changes hide text before effects and reject late replies, stale callbacks, clipboard confirmations and timers; aborting a browser request does not prove server cancellation. Retry bypasses the stale browser quota count because the API checks retained replay before quota. Error text and retry/history actions are explicit and do not echo private server messages.

The API's existing 500-character bound on every input also applies to `_previousContent`: the screen preserves longer confirmed text and explains why continuation is unavailable rather than dispatching a doomed request. This limit remains a separate implementation deliverable. Keys/results remain in memory, and replay depends on retained history; no recovery after reload/deleted history is promised. Onboarding/extension still call the legacy keyless helper, image generation/video rendering are separate flows, quota reservation across distinct operations and operational/human acceptance remain pending.

34 hook contracts and eight original-page contracts exercise lost responses, retained continuation deltas, partial flags, same-render clicks, account/auth/input/language changes, timers and clipboard. The original control/PostgreSQL flow additionally uses this original client hook against the real route/ledger/history: a lost successful HTTP acknowledgement at exhausted quota replays one saved result with one synthetic inference/settlement and one history row. No real model, browser navigation, provider request or operational acceptance is performed.

## Onboarding title generation retries — local only, 2026-10-07

The original onboarding hook now retains a random operation key and the exact topic/language/body after uncertain generation responses. Pending topic edits and replacement examples cannot silently start another operation; visible retry buttons resume the same request. HTTP/JSON errors and invalid/missing partial flags leave the result unconfirmed. Valid incomplete output is retained and explicitly labelled partial. Generation timeout aborts only the browser request, never claims server cancellation, and retains the retry key. User/email/auth/language changes hide state and reject late responses/callbacks; cleanup aborts and clears deadlines. Competing step/read callbacks cannot overtake generation; confirmed close blocks stale generation callbacks.

Result confirmation and absolute step persistence remain separate. A failed step save keeps titles and retries only the step, without another model request. Keys/results remain in memory, replay requires retained history, and no reload or deleted-history recovery is promised. Extension remains keyless; long text continuation, validated generator plan/channel reads, distinct-operation quota reservation, authentic models/sources and human/operational acceptance are pending.

42 contracts of the original hook/route include eight new retry/partial/timeout/language/race cases. Existing real PostgreSQL step cases keep strict confirmed response shapes. The control flow composes the original onboarding hook, both original routes, common runtime/ledger and real history/step rows: lost generation acknowledgement at exhausted quota replays one stored result, and a subsequent lost step acknowledgement retries only that absolute write. It verifies one synthetic inference/settlement and one history row, isolated from the other user. No real model, provider, browser navigation or deployment runs.

## Long text continuation — local only, 2026-10-07

Continuation accepts the complete confirmed assistant text up to 32,000 JavaScript string units. Ordinary form inputs remain limited to 500; no output-token allowance, task budget, quota, provider selection or isolation guard changes. The route passes the full retained text as the assistant message, binds it to the same operation digest and stores the full base plus delta. Retry returns the original delta without duplicating it. The screen and API reject a larger continuation base instead of cropping it; the confirmed full output remains visible and copyable, including a final partial response that crosses the ceiling. This is a local character ceiling, not a model token/context guarantee or evidence of real quality/cost acceptance.

44 route cases, 36 hook cases and nine original-page cases cover the exact ceiling with Unicode, over-limit rejection, ordinary-field bounds, changed-base conflict and retained-key replay after a lost response. The existing control/PostgreSQL flow now also composes a 31,990-unit partial output with a continuation whose HTTP acknowledgement is lost after real history persistence: original hook/API/runtime/adapter/ledger recover that delta at exhausted quota, with one synthetic inference/settlement per confirmed generation and one row per operation. The full stored base remains intact and another account unchanged; the next continuation is blocked when accumulated output exceeds 32,000. All transport and price evidence is synthetic. Keys/results remain in memory, retained history is required, and no recovery after reload or deleted history is promised. Extension retry integration and validated generator plan/channel reads remain local pending work; operational sources/models/authentication/acceptance remain separate dependencies.

## Generator account reads — local only, 2026-10-07

The generator uses the shared validated statistics hook instead of defaulting to ten free credits. Statistics require matching session/database ID and email, complete counters/plan and a bounded free video-tip allowance or explicit paid null. Account/auth changes hide the previous data before effects and reject late reads/refresh callbacks. First failure has an explicit retry with unconfirmed limits; refresh failure retains and labels the last confirmed plan. Confirmed text, image and video generation callbacks refresh stored counters instead of optimistic local decrements; text retry remains able to ask the server for a saved result despite unavailable/stale local plan data. Unknown/failed plan reads do not create an upgrade modal or authorize image/video actions. Displayed counts are reads, never atomic quota reservations.

A small account-scoped channel-status hook reads only the existing channel route, validates owner/boolean status and preserves unknown on HTTP/JSON/transport/shape failures. It does not fetch growth/ideas or initiate OAuth. Retry coalesces; late responses and old callbacks are ignored. Failed reads do not show a disconnected promotion; confirmed cached connection is labelled as the last stored status, not fresh operational consent. Shared statistics has 28 cases, channel status 17 and the original generator page 13. Six new real PostgreSQL contracts cover the page/hooks/original stats and cached/absent-channel routes, plan refresh after a synthetic acknowledgement, account switch and inconsistent/missing session IDs. Synthetic token expiry/cache rows only; no live Google refresh, OAuth, provider, billing or model call is exercised. Image/video action lifetimes and their independent screen state, extension retry integration, atomic quota across different operations and authentic model/source/human acceptance remain separate work.
# Generator media launch and screen lifetime — 2026-10-07

The generator's form, selected template and nudges are now account/email/auth/language scoped. Former values disappear during render, before effect cleanup; retained setters cannot restore another account's inputs. Invalid authentication hides the form. The actual canvas editor is keyed to this lifetime; account changes remount it. The old hidden thumbnail request/output path and unused photo state were removed: the visible ThumbnailEditor owns image generation, background removal and saving. Its internal asynchronous transports/uploads and uncertain-result handling remain a separate local implementation task; remounting is not server cancellation or image idempotency.

Video Tips and previews of a confirmed script now open one random preview identity for competing clicks. Scope includes template, complete inputs and current text output. Changing these closes the old modal, and retained callbacks cannot save, refresh quota, show a limit or close a replacement. The save badge follows only the child save acknowledgement; the generation acknowledgement refreshes confirmed statistics once for that adaptation. Reopening has a fresh identity; callbacks from the closed instance are inactive. Only recognized child limit reasons open a plan modal. This launch does not generate media, reserve quota or infer backend completion.

29 launch/screen/page/component cases pass with synthetic hooks, HTTP and recorder. They include recovery of independent lost storyboard/save acknowledgements against the original VideoPreviewGenerator and late old-account uploads. The database contract adds an original page/hooks/stats/plans/PostgreSQL scenario that observes a stored synthetic Video Tips generation and blocks another free launch, with another account unchanged. Existing13 page cases also pass. These checks do not establish browser codec, real model or operational acceptance; the complete verifier still has to attest this commit.

## Thumbnail editor recoverable save — local implementation, 2026-10-07

The visible editor captures immutable PNG bytes, metadata and one random key per explicit save. Competing clicks share the pending request. Lost/invalid/timeout acknowledgements retain the original capture for explicit retry; later canvas edits are labelled unsaved, and retry does not recapture. Acknowledgement must match account/key/history ID and a bounded HTTPS URL; only then does the page refresh stored quota. Account/email/auth/language/unmount changes invalidate late state and callbacks. A pending retry remains available after local Pro expires. Keys and files are memory-only; reload/unmount and deleted history do not provide durable recovery.

The API verifies account ID/email and strict PNG MIME/size/metadata, locks the synthetic tested PostgreSQL owner row, and resolves committed exact owner/key/binary+meta digest before plan/quota/storage. Changed capture conflicts409. Synthetic lost transaction acknowledgement recovers only from the exact committed history row. Blob and PostgreSQL are not atomic: a rollback after Blob may require rewriting the same keyed object and bytes. No real Blob, model, codec or browser acceptance is claimed; tests use synthetic PNG bytes, storage and HTTP. Other internal editor transports/background removal and extension keyless generation remain pending.

Directed hook/API and original editor cases plus five new original editor/hook/API/plans/PostgreSQL contracts pass. The complete original verifier must still attest this clean commit before closing the milestone.

## Photo lifecycle and explicit removal uncertainty — local implementation, 2026-10-07

The actual editor now scopes photo file/original/result/operations to account ID/email/auth/language. Replacements invalidate old image measurement, crop and removal responses. Input files require PNG/JPEG/WebP, positive size and at most10MiB; decode has a15s deadline and bounded positive dimensions/pixel count. Failed decode preserves the prior photo and shows a bounded error instead of inventing dimensions. Aspect ratio follows decoded dimensions while retaining canvas height. Photo crop requires the same original source and still-active overlay; cancelled/obsolete confirmations cannot replace a photo. Owned object URLs are revoked on replacement/removal/unmount/scope changes.

Background removal sends one original file to the existing server endpoint, merges competing clicks and has a45s client deadline. It accepts only a nonempty bounded PNG and successful decode. Failed/late/invalid results keep original photo and display uncertainty; another attempt is explicit and labelled as potentially consuming again. Automatic IS-Net fallback and unused HF/direct-provider helpers are removed; unused color controls and preprocessing helpers never affected the actual server request and have been removed. Abort does not establish server/provider cancellation or cost. No new backend idempotency or provider policy acceptance is claimed.

28 new original editor/photo cases and one new original editor/photo/save/API/plans/PostgreSQL scenario pass with synthetic decoding/object URLs/PNG/HTTP/Blob. Restoring the photo after a lost save acknowledgement preserves the exact pending save and records once on retry. Background generation/upload/crop transport lifecycle and provider-side removal recovery still require work; actual codec/render/provider quality/cost/authentication and operational acceptance remain pending. The original full verifier must still attest this commit.

## Background generation/upload/crop lifecycle — local implementation, 2026-10-07

The original visible editor now scopes background URL/topic/style, pending source/file/inputs and transport lifetime to account ID/email/auth/language. Competing actions share one request. Strict topic/style/file and bounded HTTPS output validation precedes local confirmation. Failures retain the previous image and pending original request; edits do not replace uncertain input/file. Another attempt is explicit, repeats the original input and warns that generation/upload can consume again because the existing API has no durable idempotency receipt. Discard cancels local application and permits a new explicit operation without claiming server cancellation or refunds. Late old responses/finally cannot overwrite a replacement or clear its busy state.90s client deadline and account/unmount cleanup abort transport and clear timers, without asserting backend termination.

Crop keeps previous background and overlay on failure, uploads exact cropped PNG, merges competing confirmations and requires current source/overlay. Cancellation and late toBlob/HTTP callbacks cannot replace current background. Topic/style changes label the earlier confirmed image; account changes hide state before effects.33 original editor/hook cases pass with synthetic HTTP/timers. An original editor/hook/upload API/plans/PostgreSQL contract intentionally observes two synthetic Blob writes after explicit lost-ack retry, zero model calls, then one immutable saved generation. This documents the backend limitation instead of inventing idempotency. Actual image rendering, authentication, storage/model quality/cost and operational acceptance remain pending. Backend recovery for image generation/upload/removal and extension keyless are the next local implementation work. The original complete verifier must still attest this commit.

## Removal provider boundary (local only)
The original remove-bg route now binds authenticated ID/email to the stored owner, validates a positive PNG/JPEG/WebP input <=10MiB before admission, and opts into fail-closed rate limiting (including absent/malformed counters). Legacy limiter callers keep their existing policy. Provider credentials and the fixed transport live in a separate module; redirect is rejected. Local wait is bounded at20s through a race even if fetch/body ignores abort. Cancellation is best effort, never proof of provider rollback or zero cost. Responses are streamed under10MiB and checked for PNG framing and bounded positive IHDR dimensions; this is not full PNG decoding, CRC validation or quality acceptance. Invalid responses/timeouts/transport failures return a bounded unconfirmed result with repeat-consumption warning, no raw provider/body/credential logging and no retry/fallback. Successful bytes remain no-store. No durable receipt, replay guarantee, provider recovery or idempotency is claimed. Tests use synthetic transport/PNG framing/timers and the designated PostgreSQL instance only; real auth, provider/billing and codec acceptance remain pending. Background generation and extension operation keys remain pending.

## Background image transport (local only)
The visible editor backend now binds ID/email to the stored user, validates the source/topic/style/language and positive upload MIME/size, and uses strict PostgreSQL admission: five AI requests/minute, twenty uploads/minute. Image credentials/settings and fixed provider endpoint live in the adapter. Download hosts must be explicitly configured by trusted server configuration in IDEOGRAM_DOWNLOAD_HOSTS (comma-separated exact DNS hostnames, at most16); absent/invalid configuration blocks AI before prompt/provider execution. No operational hostname is guessed, derived from response or inserted automatically. Approved hostnames are still not proof of DNS/network/provenance acceptance. Both provider and download reject redirects; the download carries no image-provider credential. A30s local race bounds generation JSON and image streaming even if transports ignore abort, JSON<=64KiB and image<=15MiB; MIME and PNG/JPEG/WebP framing are validated, not a full codec/CRC/quality assessment. Blob waits15s locally; unknown or invalid HTTPS storage acknowledgement returns503, never a temporary provider URL. No provider body, image or credentials are logged; no automatic retry/fallback. Complete prompt still comes from the common task runtime. Abort, timeouts, retained input and fixture hashes do not prove provider cancellation, rollback, durable replay, recovery authority or zero cost. The upload branch requires no AI keys/host configuration. Existing legacy generate-thumbnail route, extension operation keys, durable provider recovery and five shared operational acceptance dependencies remain pending. No real image generation, provider/storage call, installation or production change is authorized by this checkpoint.
