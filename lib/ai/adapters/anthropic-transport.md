# Explicit Anthropic Messages transport

`createAnthropicHttpAdapter` and `createAnthropicHttpsAdapter` compose the
existing protocol adapter with an explicit transport. They return original
adapter capabilities for `createSharedRuntimeBootstrap`; they do not install a
runtime, read a credential or probe a model during construction or preparation.

The Messages destination is fixed to `https://api.anthropic.com/v1/messages`.
The caller supplies an API-key reader, credential reference, API version, byte
limits, model catalog and conservative quote/measured pricing functions. An
optional workspace ID is fixed at construction. API keys through `x-api-key`,
`anthropic-version` and the workspace header follow the [official API
overview](https://platform.claude.com/docs/en/api/overview), read on 2026-10-15;
the installed SDK 0.92.0's `/v1/messages` implementation and headers were also
inspected. The transport supports this API-key path; it does not implement
Workload Identity Federation, OAuth, beta headers or automatic workspace choice.
Supplying a version/workspace string does not establish access or freshness.

The HTTP layer reuses the established OpenAI transport's deadline, UTF-8 byte,
stream cleanup and redaction design. It fixes the serialized request before
credential lookup and limits credential, response-header and body waits by the
same monotonic deadline. Caller options cannot change headers, retries or
streaming. Redirects, cookies and cache are disabled; errors discard provider
bodies, prompts and secret values. A late response is cancelled rather than
read. Native request/response limits are explicitly at most 16 MiB, stricter
than the remote API's documented request limit.

The HTTPS capability follows the existing fixed-destination connection guard:
explicit resolver, canonical public IPv4, pinned lookup, verified peer address
and hostname, built-in trust roots and TLS 1.2 minimum. It withholds the request
body and credential headers until the secure peer is verified. Each request
owns its agent with reuse, TLS session caching and environment proxies disabled.
There are no automatic retries, alternate hosts, ambient fetch/DNS/credentials
or fallback models. The already verified OpenAI implementation is unchanged.

Closed tests replace HTTPS/DNS/socket creation and credential storage. They
exercise the real TLS hostname checker and stream bridge. Native PostgreSQL
contracts connect this adapter to the shared bootstrap, three roles, bounded
task grants and the original runner: admission precedes credential/DNS, a
configuration switch preserves the original pin, settled replay does not send
again, and lost bytes retain uncertainty. The SQL contract uses one owned
rollback-only transaction, preserving all inherited rows. It does not prove
durable operational reconciliation.

No real provider call, TLS handshake, account model, pricing, quality or
operational acceptance is established. Aborting a local wait does not prove
remote cancellation. Ordinary startup and production activation remain disabled.
