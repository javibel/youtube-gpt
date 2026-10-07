// A deadline/abort bounds local waiting, not provider execution, billing or recovery.
export class RemovalUnavailable extends Error {}
export class RemovalUnconfirmed extends Error {}
export const MAX_REMOVAL_BYTES = 10 * 1024 * 1024;
export const isRemovalAvailable = () => !!process.env.REMOVE_BG_API_KEY?.trim();

export async function removeBackgroundImage(file: File, requestSignal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const key = process.env.REMOVE_BG_API_KEY?.trim();
  if (!key) throw new RemovalUnavailable();
  if (requestSignal.aborted) throw new RemovalUnconfirmed();
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let responseBody: ReadableStream<Uint8Array> | null = null;
  let rejectWait: (error: Error) => void = () => {};
  let stopped = false;
  const interruption = new Promise<never>((_,reject) => { rejectWait = reject; });
  const stop = () => { stopped = true;controller.abort();rejectWait(new RemovalUnconfirmed()); };
  requestSignal.addEventListener('abort',stop,{once:true});
  const deadline = setTimeout(stop,20_000);
  try {
    const work = (async () => {
      const form = new FormData();form.append('image_file',file,'image.png');form.append('size','auto');
      const response = await fetch('https://api.remove.bg/v1.0/removebg',{
        method:'POST',headers:{'X-Api-Key':key},body:form,signal:controller.signal,redirect:'error',
      });
      responseBody = response.body;
      if(stopped) { void response.body?.cancel().catch(() => {});throw new RemovalUnconfirmed(); }
      if(!response.ok || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'image/png' || !response.body)throw new RemovalUnconfirmed();
      const declared = response.headers.get('content-length');
      if(declared !== null && (!/^\d+$/.test(declared) || Number(declared) < 1 || Number(declared) > MAX_REMOVAL_BYTES))throw new RemovalUnconfirmed();
      reader = response.body.getReader();const chunks:Uint8Array[] = [];let size = 0;
      for (;;) {
        const part = await reader.read();if(stopped)throw new RemovalUnconfirmed();if(part.done)break;
        size += part.value.byteLength;if(size > MAX_REMOVAL_BYTES)throw new RemovalUnconfirmed();chunks.push(part.value);
      }
      if(declared !== null && Number(declared) !== size)throw new RemovalUnconfirmed();
      const png = new Uint8Array(size);let offset = 0;for(const chunk of chunks){png.set(chunk,offset);offset += chunk.byteLength;}
      // Framing/dimensions only. Full PNG decoding and quality remain acceptance work.
      const signature = [137,80,78,71,13,10,26,10];
      if(size < 33 || signature.some((byte,index) => png[index] !== byte))throw new RemovalUnconfirmed();
      const data = new DataView(png.buffer,png.byteOffset,png.byteLength);
      if(data.getUint32(8) !== 13 || String.fromCharCode(...png.slice(12,16)) !== 'IHDR')throw new RemovalUnconfirmed();
      const width = data.getUint32(16),height = data.getUint32(20);
      if(!width || !height || width > 16384 || height > 16384 || width * height > 40_000_000)throw new RemovalUnconfirmed();
      return png;
    })();
    return await Promise.race([work,interruption]);
  } catch { throw new RemovalUnconfirmed(); }
  finally {
    clearTimeout(deadline);requestSignal.removeEventListener('abort',stop);controller.abort();
    // Best effort local cancellation; never wait forever on an uncooperative stream.
    try { if(reader)void reader.cancel().catch(() => {});else void responseBody?.cancel().catch(() => {}); }
    catch { /* A failed local cancellation never proves server/provider completion. */ }
  }
}
