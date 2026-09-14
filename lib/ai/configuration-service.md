# Operator configuration service

The service validates every task in every profile, checks required runtime contract/adapter versions and rechecks credential availability before activation. Dependencies must come from trusted server composition; actor identity never comes from a request body. Credential checks report availability only and must not execute a paid provider probe.

Preview performs no writes. Its opaque token binds the operator, candidate, expected current revision, reason and expiration. Activation uses the store’s compare-and-swap operation; rollback previews an existing immutable revision. New exceptions record the authenticated actor. Lost activation acknowledgements can be retried without creating another switch. In-memory previews expire after at most five minutes; process restart requires a new preview.

This module is not an installed administrative endpoint or a live runtime bootstrap. Its tests use synthetic providers and credentials. PostgreSQL integration uses only the isolated test schema and role-bound stores. Network timeouts and runtime discovery must be provided by trusted composition.
