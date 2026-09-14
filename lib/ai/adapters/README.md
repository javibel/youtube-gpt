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
