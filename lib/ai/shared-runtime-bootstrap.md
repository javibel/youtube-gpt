# Shared web runtime composition

`installSharedRuntime` is an opt-in, server-only composition of the existing
configuration service and Messages task runtime. Ordinary startup remains
disabled. The guarded local fixture now uses this entry instead of independently
installing its own registry, factory and administrative service.

The caller must supply original adapter objects with execution functions and
explicit models, credential references, transports and pricing. Metadata alone
cannot construct an adapter. The existing Anthropic/OpenAI adapter modules keep
their translation, bounded preflight and usage accounting; this layer supplies
no SDK, credential, model, tariff, transport or fallback defaults. Declarations
and function references are captured before the first asynchronous read.

One private registry serves configuration validation and task admission. Every
profile must cover the entire supplied web AI task catalog, including base
assignments and exceptions. Reader, activator and executor capabilities retain
separate roles. Bounded preparation checks native role/endpoint/ACL observations,
immutable configuration, runtime compatibility, credential availability without
secret reads, and every explicitly bound budget. A grant is checked again for
each task; catalog capabilities cannot be removed by a caller. Preparation only
reads. It cannot publish a configuration, release a reservation or execute a
model.

After all checks, one immutable global property publishes both the native
admin-session service and task factory atomically. Duplicate server bundles
retain the original promise and service preview map. An existing standalone
installation is preserved; a conflicting or failed shared preparation installs
neither half. Cancellation, deadline, late results and replacement metadata
cannot renew it. The fixture also checks its original lifecycle immediately
before publication and tracks the preparation while draining resources.

The SQL contract exercises both original adapter modules with closed transports,
a mixed profile, a profile change, pinned run revisions and settled accounting
under the three native PostgreSQL roles. Its one owned transaction is rolled
back; it does not claim durable operational acceptance. Synthetic adapter
metadata, zero-cost fixtures and availability callbacks do not establish real
model access, tariffs, TLS, quality, authorization or consent. Operational
storage, authentication, provider transports/catalogs/tariffs and acceptance
still require their own authorized composition. Coding/agent executors remain
outside this web Messages entry.
