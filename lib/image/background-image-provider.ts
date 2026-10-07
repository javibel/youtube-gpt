export class BackgroundImageUnavailable extends Error {}
export class BackgroundImageUnconfirmed extends Error {}
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function configuration() {
  const key = (process.env.IDEOGRAM_API_KEY || process.env.ideogram)?.trim();
  const hosts = (process.env.IDEOGRAM_DOWNLOAD_HOSTS || '').split(',').map(host => host.trim().toLowerCase());
  if(!key || !hosts.length || hosts.length > 16 || hosts.some(host => host.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/.test(host) || /\.(?:local|internal|localhost)$/.test(host)))return null;
  return {key,hosts};
}
export const backgroundImageAvailable = () => configuration() !== null;

// This is a bounded local transport, not a provider receipt, retry or recovery capability.
export async function generateBackgroundImage(prompt: string, signal: AbortSignal): Promise<{bytes:Uint8Array<ArrayBuffer>;contentType:string;extension:string}> {
  const config = configuration();if(!config)throw new BackgroundImageUnavailable();
  if(!prompt.trim() || prompt.length > 4000 || signal.aborted)throw new BackgroundImageUnconfirmed();
  const controller = new AbortController(),readers = new Set<ReadableStreamDefaultReader<Uint8Array>>();
  let stopped = false,rejectWait:(error:Error) => void = () => {};
  const interruption = new Promise<never>((_,reject) => {rejectWait = reject;});
  const stop = () => {stopped = true;controller.abort();rejectWait(new BackgroundImageUnconfirmed());};
  signal.addEventListener('abort',stop,{once:true});const deadline = setTimeout(stop,30_000);
  const checked = async(response:Response,limit:number) => {
    if(stopped || !response.ok || !response.body){void response.body?.cancel().catch(() => {});throw new BackgroundImageUnconfirmed();}
    const declared = response.headers.get('content-length');
    if(declared !== null && (!/^\d+$/.test(declared) || Number(declared)<1 || Number(declared)>limit)){void response.body.cancel().catch(() => {});throw new BackgroundImageUnconfirmed();}
    const reader = response.body.getReader();readers.add(reader);const chunks:Uint8Array[] = [];let size = 0;
    for(;;){const part=await reader.read();if(stopped)throw new BackgroundImageUnconfirmed();if(part.done)break;
      size+=part.value.byteLength;if(size>limit)throw new BackgroundImageUnconfirmed();chunks.push(part.value);}
    if(!size || (declared !== null && Number(declared)!==size))throw new BackgroundImageUnconfirmed();
    const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.byteLength;}return bytes;
  };
  try {
    const work=(async()=>{
      const form=new FormData();form.append('prompt',prompt);form.append('resolution','1312x736');form.append('rendering_speed','TURBO');form.append('magic_prompt','ON');form.append('style_type','REALISTIC');
      const generated=await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate',{method:'POST',headers:{'Api-Key':config.key},body:form,signal:controller.signal,redirect:'error',cache:'no-store'});
      if(generated.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'){void generated.body?.cancel().catch(()=>{});throw new BackgroundImageUnconfirmed();}
      const data=JSON.parse(new TextDecoder().decode(await checked(generated,64*1024)));
      const value=data?.data?.[0]?.url;if(typeof value!=='string' || value.length>4096)throw new BackgroundImageUnconfirmed();
      const url=new URL(value);if(url.protocol!=='https:' || url.username || url.password || url.hash || url.port || !config.hosts.includes(url.hostname))throw new BackgroundImageUnconfirmed();
      if(stopped)throw new BackgroundImageUnconfirmed();
      // Download carries no provider credentials and cannot follow a redirect to another host.
      const downloaded=await fetch(url.href,{signal:controller.signal,redirect:'error',cache:'no-store'});
      const contentType=downloaded.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
      if(!['image/png','image/jpeg','image/webp'].includes(contentType)){void downloaded.body?.cancel().catch(()=>{});throw new BackgroundImageUnconfirmed();}
      const bytes=await checked(downloaded,MAX_IMAGE_BYTES);
      let extension='';
      if(contentType==='image/jpeg' && bytes.length>=4 && bytes[0]===255 && bytes[1]===216 && bytes.at(-2)===255 && bytes.at(-1)===217)extension='jpg';
      if(contentType==='image/webp' && bytes.length>=12 && String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP')extension='webp';
      if(contentType==='image/png' && bytes.length>=33 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)){
        const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),width=header.getUint32(16),height=header.getUint32(20);
        if(header.getUint32(8)===13 && String.fromCharCode(...bytes.slice(12,16))==='IHDR' && width>0 && height>0 && width<=16384 && height<=16384 && width*height<=40_000_000)extension='png';
      }
      if(!extension || stopped)throw new BackgroundImageUnconfirmed();
      // Framing checks only; codec decoding, CRC and visual quality are not established here.
      return {bytes,contentType,extension};
    })();
    return await Promise.race([work,interruption]);
  }catch{throw new BackgroundImageUnconfirmed();}
  finally{clearTimeout(deadline);signal.removeEventListener('abort',stop);controller.abort();for(const reader of readers)void reader.cancel().catch(()=>{});}
}
