// A model may wrap a requested JSON reply in a ```json ... ``` fence even when told
// not to. Parsing the fence as JSON would discard the optional analysis.
//
// Order matters: trim FIRST, then strip the fences. The fence anchors are ^ and $, so a
// leading newline (which the model does emit) would otherwise leave the fence in place and
// the parse would still throw — making this helper silently useless.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseFencedJson<T = any>(text: string): T {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  return JSON.parse(unfenced);
}
