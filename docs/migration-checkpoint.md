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
