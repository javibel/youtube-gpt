# Retention analysis boundary

An explicit click starts one client request. The native cookie principal, verified
account, paid subscription and stored channel/token restrict its original 55s
lifetime. Body, language and operation key are fixed before authentication. Each
dependent source/model step and the final response recheck the captured native
context. Cancellation or a missing response never establishes success or permits
recovery. Expired tokens require reconnection; this flow performs no implicit OAuth
refresh, stale-token fallback or token write.

Recent selection uses the authenticated channel's uploads playlist, limited to its
first five entries. Explicit selection still requires matching video ownership.
Metadata and all 100 ordered retention intervals are required for every selected
video; incomplete sources do not silently produce zero/default facts. Requested
dates remain request bounds. Actual coverage and freshness are not reported.

YouTube defines the interval ends as 0.01..1.0 and allows watch ratios above one
because of repeat viewing. The early score averages only complete intervals ending
within 30 seconds and reports that window; it is unavailable if one interval exceeds
30 seconds. Drop times identify interval ends, not observed events or causes.
See [dimensions](https://developers.google.com/youtube/analytics/dimensions),
[metrics](https://developers.google.com/youtube/analytics/metrics) and
[reports](https://developers.google.com/youtube/analytics/reference/reports/query).

The common task runtime retains provider/configuration/admission/accounting policy.
The caller supplies the captured operation key and cancellation signal, with a
schema limited to selected videos and observed interval timestamps. AI text is
displayed as hypotheses to investigate. A failed/invalid/incomplete model response
leaves an explicitly data-only result without retry. Local closed transports and
synthetic SQL accounts do not establish real OAuth consent, source provenance,
freshness, model quality, billing accuracy or operational acceptance.

The client accepts only its original response and exact actor/session/command,
language and requested range. It retires on session/language/view changes or lost
focus. An acknowledged immutable chart may remain in that same view; its timestamp
does not claim that the source data is fresh or permit another dependent effect.
