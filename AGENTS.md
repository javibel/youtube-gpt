<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


# Migration v1.1 — local-only override
Work only in this independent repository. References above to operational working directories are documentation, not writable targets. Never push, open PRs, deploy (including previews), restart operational services, send communications or use production credentials. Use only the migration test configuration. npm startup is intentionally blocked until legacy effects are isolated. Do not bypass that guard. Only local commits and offline tests are authorized. Keep private agent material out of the web repository.

The dedicated migration:compile check is also allowed. Its version-pinned runner validates isolation, strips inherited configuration, fixes Next to compile-only mode and never permits mode overrides. This is not permission to run a full build, page generation or application startup. The opt-in local database contract test uses only the identified synthetic PostgreSQL instance.

The separate migration:build runner may test a full local build after verifying the synthetic database identity. It uses synthetic environment values, blocks Node HTTP/TLS/fetch/process effects, permits only the designated PostgreSQL socket, and enforces the same guard in worker threads. This test entry does not enable npm build, dev, start, browser sessions, deployment, real provider calls or production access. Compiler-native public font fetching is distinct from application/provider transport; no real credentials are available to the runner.
