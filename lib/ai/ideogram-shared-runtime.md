# Image composition in the shared runtime

createIdeogramSharedRuntimeDependencies captures the original image transport,
quote and measured-cost functions and joins the explicit image catalog, policy
and budget bindings to the existing shared registry. Pass its returned object
to installSharedRuntime (or createSharedRuntimeBootstrap for a local contract).
The existing atomic installer keeps its original preparation and native
reader/activator/executor checks. Nothing imports this entry into startup.

Supply the complete mixed catalog, policies and budget bindings; the image task
must declare text/json/image_generation, web AI execution, brand-agent service,
no tools, a 1–30000ms deadline and at least 2048 output tokens. Supply the verified
ideogram-v3 declaration and an explicit currency/tariff version. No credentials,
tariffs, model access, transport or operational authority are discovered here.

The native common store admits and reserves before provider dispatch. Quote
mismatch rejects before dispatch and may settle a zero-cost rejection. A lost
provider result or unknown/mismatched measured tariff keeps the original
reservation uncertain. A later invocation cannot redispatch that original.
A URL can be returned with an uncertain cost; it is not a settled ledger ACK.
The cron's source/image/cache/publication capabilities remain separate.

Local closed transport and rollback-only SQL checks do not prove operational
catalog provenance, TLS, real prices, available models, consent or activation.
