# Anthropic protocol preparation

`anthropic.cjs` translates the portable contract through an injected transport. It neither imports the SDK nor reads secrets nor chooses a default model. Tests inject synthetic messages and a synthetic tariff; no provider requests run.

The installed SDK 0.92.0 declarations were checked for message blocks, stop reasons, URL images, web search and per-request `maxRetries`, `timeout` and `signal`. Official documentation checked on 2026-09-14:

- https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons
- https://platform.claude.com/docs/en/api/errors
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool

This implementation does not follow documentation suggestions to retry or fall back automatically: configuration explicitly forbids hidden fallback. SDK retry count is zero. Unknown transport outcomes retain uncertainty.

Only leading text system messages, user/assistant text history, URL images and explicitly bounded web search are translated. Tool-result histories, assistant prefill and interleaved system messages are rejected pending fuller portable contracts. JSON is requested through schema instructions and validated locally; native structured-output capability is not claimed. Unexpected stop values fail. Truncation, pause and pending tool work remain incomplete. Only web URL citations map to current source contracts; other citation formats need an extension before enabling document-citation tasks.

Preflight is a trusted local conservative quote function, not an additional remote provider call. It must include all billable input, output, cache and tool bounds. The future real transport must honor cancellation and pass request options to the SDK. Pricing is separately injected; unknown or invalid pricing evidence keeps cost unknown. This adapter does not itself create budget reservations: use the durable task runner.

All 32 inventoried web references now consume the common runtime (23 routes and 4 libraries). Dedicated suites exercise actual callables and the contract chain with synthetic storage and transport. They do not establish live quality, production activation or exhaustive effect recovery.

`task-runtime.ts` is installed once by trusted server bootstrap. No bootstrap is enabled yet: an unconfigured runtime returns a controlled 503 through the migrated route, never a hidden direct-SDK fallback. Completing the guarded local bootstrap is required before enabling application startup. Live credentials, verified account models, real tariff versions and bounded live comparisons remain pending. Synthetic tests are not production activation approval.

Update: seven routes now use this boundary (generate, chat, storyboard, background prompt, Analytics, AB suggestions, best-time tips). Explicit partial text is permitted only for the generation continuation flow, remains canonically incomplete and never exposes partial structured data. Prompt-cache intent uses an explicit system breakpoint; a cache hit is not guaranteed. Reference: https://platform.claude.com/docs/en/build-with-claude/prompt-caching .

Twelve routes now use this boundary: additionally Coach, bulk generation, calendar suggestions, performance prediction and retention insights. Retention requires the requested typed object; unexpected legacy arrays keep metrics but yield no AI tips. History display treats ambiguous legacy zero as unknown; ledger linkage is pending.

Current service grants: public-seo, brand-agent and morning-cron must be explicitly allowed per task and authorized to a budget. Business search declarations use `{name: "web_search", maxCalls: N}`; the facade retains legacy compatibility but rejects mixed declarations and any allowance exceeding trusted policy.

OpenAI Responses adapter (2026-09-15): `openai.cjs` also uses injected transport/catalog/pricing only; no SDK or credential is installed or read. It disables storage, streaming, background execution and automatic retries. Leading instructions, text history, HTTPS image references and bounded built-in web search map to the common contract. JSON follows the same explicit instruction-plus-local-validation strategy as the Anthropic adapter; native strict Structured Outputs are not claimed. Prompt cache intent preserves a leading reusable prefix with provider implicit caching; neither a hit nor a particular cache lifetime is guaranteed.

Input usage buckets are non-overlapping: ordinary/uncached input, cache read and cache write. Responses total input is reduced by its reported cache read/write counters; absent or inconsistent counters keep ordinary input unknown. Output includes the provider's reported output total (including reasoning). A caller must not add OpenAI's raw total to the cache buckets. Pricing must conservatively cover all input/output/cache/tool costs and is not inferred from model names.

Official sources opened on 2026-09-15:
- https://developers.openai.com/api/reference/typescript/resources/responses/methods/create
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/prompt-caching

41 OpenAI protocol tests and 6 common-runner switch tests pass with synthetic data. Both adapters preserve pinned execution configuration across switches and rollbacks and never silently fall back. Account model availability, actual SDK transport, live quality/cost and application bootstrap remain pending.
