export type SeoLiveInput = Readonly<{ title: string; description: string; tags: readonly string[] }>;
export function validSeoLiveInput(value: unknown): value is SeoLiveInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.title === 'string' && v.title.length <= 200
    && typeof v.description === 'string' && v.description.length <= 10_000
    && Array.isArray(v.tags) && v.tags.length <= 100 && v.tags.every(t => typeof t === 'string' && t.length <= 500);
}
export async function readSeoLiveInputBody(request: Request, check: () => void): Promise<SeoLiveInput | null> {
  check();
  if (!request.body || (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') return null;
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 65_536)) return null;
  const reader=request.body.getReader(), decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
  try {
    for (;;) {
      check(); const part=await reader.read(); check(); if (part.done) break;
      bytes+=part.value.byteLength; if (bytes>65_536) return null;
      try { text+=decoder.decode(part.value,{stream:true}); } catch { return null; }
    }
    check();
    let body: unknown; try { body=JSON.parse(text+decoder.decode()); } catch { return null; }
    if (!body || typeof body!=='object' || Array.isArray(body)) return null;
    const v=body as Record<string,unknown>, input={title:v.title===undefined?'':v.title,description:v.description===undefined?'':v.description,tags:v.tags===undefined?[]:v.tags};
    if (!validSeoLiveInput(input)) return null;
    return Object.freeze({title:input.title,description:input.description,tags:Object.freeze([...input.tags])});
  } finally { try { void reader.cancel().catch(()=>{}); } catch {} }
}
