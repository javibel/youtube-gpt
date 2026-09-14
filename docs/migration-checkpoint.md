# Migration checkpoint — specification v1.1

Independent shallow repository reconstructed from the current committed snapshot. No operational files, uncommitted changes, shared object stores or historical commits were copied. All work is local.

The migration config is ../migration-config.json relative to this repository. Test runtime directories are ../migration-runtime. Test database is designated only; no database server has been provisioned.

npm run migration:check validates the map. npm run migration:test runs offline fixtures. Normal npm startup/build/dashboard are blocked until legacy effects have tested simulation adapters. This is an entry-point guard, not an OS sandbox; do not invoke legacy scripts directly or disable npm lifecycle scripts to bypass it.

Push URL is disabled and a pre-push hook rejects pushes. No push was used to test this. Never add deployment remotes or activate Vercel during development.

Pending: trace each legacy external effect, prepare real test DB, complete functional baseline, enable controlled test runner only after effects are isolated.

## Offline payment boundary

lib/stripe.ts uses a migration-only facade with the existing Stripe types, without importing or constructing the Stripe SDK at runtime. Operations require validated configuration and exact synthetic argument fixtures. Unknown calls fail; checkout and portal redirects must use example.invalid. Webhook ingestion remains blocked rather than pretending to verify signatures. Eleven tests exercise this facade and the actual TypeScript entry without external effects. Together with isolation tests, the web suite has 38 passing cases. Targeted strict typechecking of lib/stripe.ts passes. This is not a full application typecheck or build, and normal startup remains blocked.
