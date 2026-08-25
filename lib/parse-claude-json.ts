// Claude sometimes wraps a requested JSON reply in a ```json ... ``` fence even when told
// not to. Parsing that raw throws and silently drops the whole AI analysis (the failure mode
// behind several "no aparece el texto de Claude" reports — see Issues notes.txt 09-13/2026-08-25).
//
// Order matters: trim FIRST, then strip the fences. The fence anchors are ^ and $, so a
// leading newline (which the model does emit) would otherwise leave the fence in place and
// the parse would still throw — making this helper silently useless.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseClaudeJson<T = any>(text: string): T {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  return JSON.parse(unfenced);
}
