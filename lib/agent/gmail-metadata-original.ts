/** Authenticated manual Gmail metadata read. The opaque live receipt is data;
 * it grants no draft,send,mark-read,continuation or operative freshness consent.
 * API contracts: developers.google.com/workspace/gmail/api/reference/rest/v1/
 * users.messages/list, users.messages/get, users/getProfile and Format.
 */
import type { NativeAdminGmailMetadata, NativeAdminGmailText } from '@/lib/admin-social-messages';

declare const gmailMetadataRead: unique symbol;
export type GmailMetadataRead = { readonly [gmailMetadataRead]: true };
export type GmailMetadataSource = Readonly<{ id: string; threadId: string; labels: readonly string[]; headers: readonly Readonly<{ name: string; value: string }>[] }>;
export type GmailMetadataWindow = Readonly<{ configured: boolean; pages: number; scanned: number; hasMore: boolean;
  messages: readonly GmailMetadataSource[]; coverage: 'at-most-ten-unread-inbox-messages-one-list-page';
  content: 'selected-headers-only-no-body-or-attachments'; acceptance: 'read-only-not-draft-send-consent-or-operative-freshness' }>;
type Context = Readonly<{ at: number; signal: AbortSignal; checkBeforeRead: () => void; remainingBeforeRead: () => number }>;
const requests = new WeakMap<object, Promise<GmailMetadataRead>>();
const reads = new WeakMap<object, { original: object; context: Context; window: GmailMetadataWindow; full?:(source:GmailMetadataSource,remaining:number)=>Promise<GmailTextSource|null>; promise?: Promise<unknown> }>();
const raw = Object.freeze({ GMAIL_READ_ENABLED: process.env.GMAIL_READ_ENABLED, GMAIL_TEXT_READ_ENABLED:process.env.GMAIL_TEXT_READ_ENABLED, GMAIL_READ_MAILBOX: process.env.GMAIL_READ_MAILBOX,
  GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN });
const nativeFetch = globalThis.fetch, scope = 'https://www.googleapis.com/auth/gmail.readonly';
const base = 'https://gmail.googleapis.com/gmail/v1/users/me', tokenUrl = 'https://oauth2.googleapis.com/token';
const selected = Object.freeze(['From','To','Subject','Message-Id','Reply-To','Date','List-Unsubscribe']);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const credential = (value: unknown): value is string => text(value, 8192) && value.length > 0 && value.trim() === value;
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{1,128}$/.test(value);
function checkConfiguration() {
  for (const name of Object.keys(raw) as (keyof typeof raw)[]) if (process.env[name] !== raw[name]) throw Error('gmail_metadata_unconfirmed');
}

// Exactly one token refresh,profile,list and at most ten metadata GETs may be
// issued by the live original. No library retries,token cache or next-page fetch.
async function json(url: string, settings: RequestInit, context: Context): Promise<unknown> {
  context.checkBeforeRead();
  const controller = new AbortController(), abort = () => controller.abort(Error('gmail_metadata_unconfirmed'));
  const timer = setTimeout(abort, Math.max(1, Math.floor(context.remainingBeforeRead()))); timer.unref?.();
  context.signal.addEventListener('abort', abort, { once: true });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, canceled: Promise<void> | undefined, finished = false;
  const cancelRead = () => { if (reader) canceled = reader.cancel().catch(() => {}); };
  controller.signal.addEventListener('abort', cancelRead, { once: true });
  try {
    context.checkBeforeRead(); if (controller.signal.aborted || context.signal.aborted) throw Error('gmail_metadata_unconfirmed');
    const response = await nativeFetch(url, { ...settings, cache: 'no-store', redirect: 'error', credentials: 'omit', signal: controller.signal });
    context.checkBeforeRead();
    if (controller.signal.aborted || response.status !== 200 || response.ok !== true || response.redirected
      || response.url && response.url !== url || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) throw Error('gmail_metadata_unconfirmed');
    reader = response.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true }); let content = '', bytes = 0, chunks = 0;
    for (;;) {
      context.checkBeforeRead(); if (controller.signal.aborted) throw Error('gmail_metadata_unconfirmed');
      const part = await reader.read(); context.checkBeforeRead(); if (controller.signal.aborted) throw Error('gmail_metadata_unconfirmed');
      if (part.done) { finished = true; break; }
      bytes += part.value.byteLength; if (bytes > 65536 || ++chunks > 128) throw Error('gmail_metadata_unconfirmed');
      content += decoder.decode(part.value, { stream: true });
    }
    content += decoder.decode(); context.checkBeforeRead(); const value: unknown = JSON.parse(content);
    if (!object(value) || 'error' in value) throw Error('gmail_metadata_unconfirmed'); return value;
  } finally {
    clearTimeout(timer); context.signal.removeEventListener('abort', abort); controller.signal.removeEventListener('abort', cancelRead);
    if (canceled) await canceled; if (reader && !finished) await reader.cancel().catch(() => {}); controller.abort(); reader?.releaseLock();
  }
}
function metadata(value: unknown, source: Readonly<{ id: string; threadId: string }>): GmailMetadataSource {
  if (!object(value) || value.id !== source.id || value.threadId !== source.threadId || !Array.isArray(value.labelIds)
    || value.labelIds.length > 128 || !value.labelIds.every(v => text(v, 128) && v.length > 0) || new Set(value.labelIds).size !== value.labelIds.length
    || !value.labelIds.includes('INBOX') || !value.labelIds.includes('UNREAD') || value.labelIds.some(v => ['SENT','DRAFT','TRASH','SPAM'].includes(v as string))
    || !object(value.payload) || !Array.isArray(value.payload.headers) || value.payload.headers.length > 32
    || 'raw' in value || 'body' in value.payload || 'parts' in value.payload) throw Error('gmail_metadata_unconfirmed');
  const headers: Readonly<{ name: string; value: string }>[] = [], names = new Set<string>();
  for (const row of value.payload.headers) {
    if (!object(row) || !text(row.name, 64) || !text(row.value, 8192) || !selected.some(n => n.toLowerCase() === (row.name as string).toLowerCase())
      || names.has(row.name.toLowerCase())) throw Error('gmail_metadata_unconfirmed');
    names.add(row.name.toLowerCase()); headers.push(Object.freeze({ name: row.name, value: row.value }));
  }
  if (!headers.some(h => h.name.toLowerCase() === 'from' && h.value.length > 0)) throw Error('gmail_metadata_unconfirmed');
  return Object.freeze({ id: source.id, threadId: source.threadId, labels: Object.freeze(value.labelIds as string[]), headers: Object.freeze(headers) });
}
export function readGmailMetadata(original?: NativeAdminGmailMetadata): Promise<GmailMetadataRead> {
  if (!original || typeof original !== 'object') return Promise.reject(Error('gmail_metadata_unconfirmed'));
  const previous = requests.get(original); if (previous) return previous;
  const pending = (async () => {
    const { runAdminGmailMetadata } = await import('@/lib/admin-social-messages');
    return runAdminGmailMetadata(original, async native => {
      const check = () => { native.checkBeforeRead(); checkConfiguration(); }, context = Object.freeze({ ...native, checkBeforeRead: check }); check();
      // These are dedicated read settings. Legacy GOOGLE_* and AGENT_EMAIL are
      // neither fallback credentials nor proof of the mailbox or sending alias.
      const mailbox = raw.GMAIL_READ_MAILBOX;
      const configured = raw.GMAIL_READ_ENABLED === 'true' && typeof mailbox === 'string' && mailbox.length <= 254
        && /^[a-z0-9.!#$%&'*+\/=?^_\x60{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(mailbox)
        && credential(raw.GMAIL_CLIENT_ID) && credential(raw.GMAIL_CLIENT_SECRET) && credential(raw.GMAIL_REFRESH_TOKEN);
      let full:((source:GmailMetadataSource,remaining:number)=>Promise<GmailTextSource|null>)|undefined;
      let receiptContext: Context = context; let pages = 0, hasMore = false; const messages: GmailMetadataSource[] = [];
      if (configured) {
        const tokenAt = Date.now(), tokenStarted = performance.now();
        const token = await json(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({ client_id: raw.GMAIL_CLIENT_ID!, client_secret: raw.GMAIL_CLIENT_SECRET!, refresh_token: raw.GMAIL_REFRESH_TOKEN!, grant_type: 'refresh_token' }) }, context);
        check();
        if (!object(token) || typeof token.access_token !== 'string' || !/^[A-Za-z0-9._~+\/=-]{1,8192}$/.test(token.access_token)
          || token.token_type !== 'Bearer' || token.scope !== scope || !Number.isSafeInteger(token.expires_in) || (token.expires_in as number) <= 0 || (token.expires_in as number) > 86400) throw Error('gmail_metadata_unconfirmed');
        const tokenUntil = tokenAt + (token.expires_in as number) * 1000, tokenDeadline = tokenStarted + (token.expires_in as number) * 1000;
        const live = () => { check(); if (Date.now() < tokenAt || Date.now() >= tokenUntil || performance.now() < tokenStarted || performance.now() >= tokenDeadline) throw Error('gmail_metadata_unconfirmed'); };
        const authorized = Object.freeze({ ...context, checkBeforeRead: live, remainingBeforeRead: () => { live(); return Math.min(context.remainingBeforeRead(), tokenUntil - Date.now(), tokenDeadline - performance.now()); } });
        receiptContext = authorized;
        const headers = Object.freeze({ Authorization: 'Bearer ' + token.access_token, Accept: 'application/json' });
        full=async(source:GmailMetadataSource,remaining:number)=>{
          live();if(!messages.includes(source))throw Error('gmail_text_unconfirmed');
          const url=new URL(base+'/messages/'+source.id);url.searchParams.set('format','full');
          // No data in preflight. Only uniform-depth plain leaves in a wholly
          // plain multipart/mixed tree allow a data mask at that single depth.
          url.searchParams.set('fields',textFields());
          const before=plainShape(await json(url.toString(),{method:'GET',headers},authorized),source,undefined,remaining);live();
          if(!before)return null;
          url.searchParams.set('fields',textFields(before.depth));
          const value=await json(url.toString(),{method:'GET',headers},authorized);live();
          const after=plainShape(value,source,before.depth,remaining);
          // A changed representation is a veto,not a fresh source or permission.
          // Encoded bytes can have arrived before this veto;never decode them.
          if(!after||after.signature!==before.signature)throw Error('gmail_text_unconfirmed');
          return decodePlain(after,source);
        };
        const profile = await json(base + '/profile', { method: 'GET', headers }, authorized); live();
        if (!object(profile) || typeof profile.emailAddress !== 'string' || profile.emailAddress.toLowerCase() !== mailbox) throw Error('gmail_metadata_unconfirmed');
        const url = new URL(base + '/messages'); url.searchParams.set('q', 'is:unread in:inbox -from:' + mailbox); url.searchParams.set('maxResults', '10'); url.searchParams.set('includeSpamTrash', 'false');
        const list = await json(url.toString(), { method: 'GET', headers }, authorized); live();
        if (!object(list) || list.messages !== undefined && !Array.isArray(list.messages) || list.nextPageToken !== undefined && (!text(list.nextPageToken, 2048) || !list.nextPageToken.length)
          || list.resultSizeEstimate !== undefined && (!Number.isSafeInteger(list.resultSizeEstimate) || (list.resultSizeEstimate as number) < 0)) throw Error('gmail_metadata_unconfirmed');
        const sources = (list.messages ?? []) as unknown[]; if (sources.length > 10) throw Error('gmail_metadata_unconfirmed');
        const seen = new Set<string>(), rows: { id: string; threadId: string }[] = [];
        for (const row of sources) { if (!object(row) || !id(row.id) || !id(row.threadId) || seen.has(row.id)) throw Error('gmail_metadata_unconfirmed'); seen.add(row.id); rows.push({ id: row.id, threadId: row.threadId }); }
        pages = 1; hasMore = list.nextPageToken !== undefined;
        for (const row of rows) {
          live(); const target = new URL(base + '/messages/' + row.id); target.searchParams.set('format', 'metadata'); target.searchParams.set('fields', 'id,threadId,labelIds,payload(headers)');
          for (const name of selected) target.searchParams.append('metadataHeaders', name);
          const value = await json(target.toString(), { method: 'GET', headers }, authorized); live(); messages.push(metadata(value, row));
        }
        live();
      }
      receiptContext.checkBeforeRead(); const window: GmailMetadataWindow = Object.freeze({ configured, pages, scanned: messages.length, hasMore, messages: Object.freeze(messages),
        coverage: 'at-most-ten-unread-inbox-messages-one-list-page', content: 'selected-headers-only-no-body-or-attachments', acceptance: 'read-only-not-draft-send-consent-or-operative-freshness' });
      const receipt = Object.freeze({}) as GmailMetadataRead; reads.set(receipt, { original, context: receiptContext, window, full }); return receipt;
    });
  })().then(receipt => { if (!receipt || typeof receipt !== 'object' || reads.get(receipt)?.original !== original) throw Error('gmail_metadata_unconfirmed'); return receipt; }).catch(() => { throw Error('gmail_metadata_unconfirmed'); });
  requests.set(original, pending); return pending;
}
export function consumeGmailMetadata<T>(receipt: GmailMetadataRead | undefined, run: (window: GmailMetadataWindow) => Promise<T>): Promise<T> {
  const own = receipt && reads.get(receipt); if (!own) return Promise.reject(Error('gmail_metadata_unconfirmed'));
  return (own.promise ??= Promise.resolve().then(async () => { own.context.checkBeforeRead(); const value = await run(own.window); own.context.checkBeforeRead(); return value; })) as Promise<T>;
}

// This is only a veto on the same private read after another dependency waits.
// No new token,date,source,continuation or consumer can be adopted here.
export function validateGmailMetadataRead(receipt: GmailMetadataRead | undefined): void {
  const own = receipt && reads.get(receipt); if (!own) throw Error('gmail_metadata_unconfirmed'); own.context.checkBeforeRead();
}

// The distinct native text child must reference this exact metadata purpose and
// its private live receipt. No callback/DTO/time can select a different source.
declare const gmailTextRead:unique symbol;
export type GmailTextRead={readonly [gmailTextRead]:true};
export type GmailTextSource=Readonly<{source:GmailMetadataSource;text:string;bytes:number;parts:readonly Readonly<{partId:string;path:readonly number[];text:string;bytes:number}>[]}>;
export type GmailTextWindow=Readonly<{configured:boolean;read:number;skipped:number;messages:readonly GmailTextSource[];
  coverage:'at-most-ten-root-or-uniform-plain-mixed-messages';content:'utf8-or-ascii-plain-mixed-no-html-alternatives-or-attachments';acceptance:'data-only-not-draft-send-consent-or-operative-freshness'}>;
const textRequests=new WeakMap<object,Promise<GmailTextRead>>(),textReads=new WeakMap<object,{original:object;context:Context;window:GmailTextWindow;promise?:Promise<unknown>}>();
// Field masks select all siblings. Data is requested only at the single leaf
// depth of an entirely plain multipart/mixed tree,never by invented part filters.
function textFields(dataDepth?:number):string{
  const part=(depth:number):string=>'partId,mimeType,filename,headers,body(size,'+(depth===dataDepth?'data,':'')+'attachmentId),parts('+(depth<4?part(depth+1):'partId,mimeType')+')';
  return 'id,threadId,labelIds,payload('+part(0)+')';
}
type PlainLeaf={body:Record<string,unknown>;utf8:boolean;partId:string;path:readonly number[]};
function plainShape(value:unknown,source:GmailMetadataSource,dataDepth:number|undefined,remaining:number){
  if(!object(value)||Object.keys(value).some(k=>!['id','threadId','labelIds','payload'].includes(k))||!object(value.payload))throw Error('gmail_text_unconfirmed');
  let nodes=0,headerCount=0,unsupported=false;const ids=new Set<string>(),leaves:PlainLeaf[]=[];
  const headers=(rows:unknown,root:boolean)=>{
    if(rows===undefined&&!root)return [];
    if(!Array.isArray(rows)||rows.length>128||(headerCount+=rows.length)>256)throw Error('gmail_text_unconfirmed');
    const result:{name:string;value:string}[]=[],names=new Set<string>();
    for(const h of rows){
      if(!object(h)||Object.keys(h).some(k=>!['name','value'].includes(k))||!text(h.name,64)||!h.name.length||!text(h.value,8192))throw Error('gmail_text_unconfirmed');
      const name=h.name.toLowerCase();
      if(names.has(name)&&(selected.some(n=>n.toLowerCase()===name)||['content-type','content-disposition'].includes(name)))throw Error('gmail_text_unconfirmed');
      names.add(name);result.push({name:h.name,value:h.value});
    }
    return result;
  };
  const rootHeaders=headers(value.payload.headers,true),current=metadata({...value,payload:{headers:rootHeaders.filter(h=>selected.some(n=>n.toLowerCase()===h.name.toLowerCase()))}},source);
  const hs=(rows:readonly Readonly<{name:string;value:string}>[])=>JSON.stringify(rows.map(h=>[h.name.toLowerCase(),h.value]).sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1])));
  if(hs(current.headers)!==hs(source.headers)||JSON.stringify([...current.labels].sort())!==JSON.stringify([...source.labels].sort()))throw Error('gmail_text_unconfirmed');
  const walk=(p:unknown,position:readonly number[]):unknown=>{
    const depth=position.length;if(++nodes>32||depth>4||!object(p)||Object.keys(p).some(k=>!['partId','mimeType','filename','headers','body','parts'].includes(k))||!text(p.mimeType,128)
      ||p.partId!==undefined&&!text(p.partId,128)||p.filename!==undefined&&!text(p.filename,512)||!object(p.body)
      ||Object.keys(p.body).some(k=>!(depth===dataDepth?['size','data','attachmentId']:['size','attachmentId']).includes(k))
      ||!Number.isSafeInteger(p.body.size)||(p.body.size as number)<0||p.parts!==undefined&&(!Array.isArray(p.parts)||p.parts.length>8))throw Error('gmail_text_unconfirmed');
    const partId=typeof p.partId==='string'?p.partId:'';
    if(partId){if(ids.has(partId))throw Error('gmail_text_unconfirmed');ids.add(partId);}else if(depth)unsupported=true;
    const h=depth?headers(p.headers,false):rootHeaders,ct=h.find(v=>v.name.toLowerCase()==='content-type')?.value,disposition=h.find(v=>v.name.toLowerCase()==='content-disposition')?.value;
    if(p.filename||p.body.attachmentId!==undefined||disposition!==undefined&&!/^inline$/i.test(disposition))unsupported=true;
    const children=(p.parts??[]) as unknown[],mime=p.mimeType.toLowerCase();
    if(mime==='text/plain'){
      const charset=ct?.match(/^text\/plain(?:\s*;\s*charset\s*=\s*(?:"(utf-8|us-ascii)"|(utf-8|us-ascii)))?\s*$/i);
      if(children.length||ct!==undefined&&!charset)unsupported=true;
      leaves.push({body:p.body,utf8:(charset?.[1]??charset?.[2])?.toLowerCase()==='utf-8',partId,path:Object.freeze([...position])});
    }else if(mime==='multipart/mixed'){
      if(!children.length||p.body.size!==0||ct!==undefined&&!/^multipart\/mixed(?:\s*;\s*boundary\s*=\s*(?:"[^"\r\n]{1,200}"|[A-Za-z0-9'()+_,.\/:=?-]{1,200}))?\s*$/i.test(ct))unsupported=true;
    }else unsupported=true;
    const parts=children.map((child,i)=>walk(child,[...position,i]));
    return {partId,mimeType:p.mimeType,filename:p.filename??'',headers:hs(h),size:p.body.size,parts};
  };
  const shape=walk(value.payload,[]);if(leaves.length>8)throw Error('gmail_text_unconfirmed');
  if(unsupported||!leaves.length||new Set(leaves.map(v=>v.path.length)).size!==1)return null;
  const bytes=leaves.reduce((sum,p)=>sum+(p.body.size as number),0)+2*(leaves.length-1);
  if(!Number.isSafeInteger(bytes)||bytes>16384||bytes>remaining)throw Error('gmail_text_unconfirmed');
  return {leaves,depth:leaves[0].path.length,bytes,signature:JSON.stringify({id:source.id,threadId:source.threadId,labels:[...current.labels].sort(),shape})};
}
function decodePlain(shape:NonNullable<ReturnType<typeof plainShape>>,source:GmailMetadataSource):GmailTextSource{
  const parts=shape.leaves.map(leaf=>{
    const size=leaf.body.size,data=leaf.body.data??(size===0?'':undefined);
    if(typeof data!=='string'||data.length>21848||!/^[-_A-Za-z0-9]*={0,2}$/.test(data))throw Error('gmail_text_unconfirmed');
    const unpadded=data.replace(/=+$/,''),padding=data.length-unpadded.length;
    if(unpadded.length%4===1||padding&&padding!==(4-unpadded.length%4)%4)throw Error('gmail_text_unconfirmed');
    const bytes=Buffer.from(data,'base64url');if(bytes.length!==size||bytes.toString('base64url')!==unpadded||!leaf.utf8&&bytes.some((b:number)=>b>127))throw Error('gmail_text_unconfirmed');
    const valueText=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
    if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(valueText))throw Error('gmail_text_unconfirmed');
    return Object.freeze({partId:leaf.partId,path:leaf.path,text:valueText,bytes:bytes.length});
  });
  return Object.freeze({source,parts:Object.freeze(parts),text:parts.map(p=>p.text).join('\n\n'),bytes:shape.bytes});
}
export function readGmailText(original?:NativeAdminGmailText):Promise<GmailTextRead>{
  if(!original||typeof original!=='object')return Promise.reject(Error('gmail_text_unconfirmed'));
  const prior=textRequests.get(original);if(prior)return prior;
  const pending=(async()=>{
    const {runAdminGmailText}=await import('@/lib/admin-social-messages');
    return runAdminGmailText(original,async native=>{
      const own=reads.get(native.metadataRead);if(!own||own.original!==native.metadataPurpose)throw Error('gmail_text_unconfirmed');
      const check=()=>{native.checkBeforeRead();own.context.checkBeforeRead();checkConfiguration();};check();
      const configured=raw.GMAIL_TEXT_READ_ENABLED==='true'&&own.window.configured;
      const messages:GmailTextSource[]=[];let skipped=0,bytes=0;
      if(configured){if(!own.full)throw Error('gmail_text_unconfirmed');
        for(const source of own.window.messages){check();const row=await own.full(source,65536-bytes);check();if(row){bytes+=row.bytes;messages.push(row);}else skipped++;}
      }
      check();const window:GmailTextWindow=Object.freeze({configured,read:messages.length,skipped,messages:Object.freeze(messages),coverage:'at-most-ten-root-or-uniform-plain-mixed-messages',content:'utf8-or-ascii-plain-mixed-no-html-alternatives-or-attachments',acceptance:'data-only-not-draft-send-consent-or-operative-freshness'});
      const receipt=Object.freeze({}) as GmailTextRead;textReads.set(receipt,{original,context:Object.freeze({...own.context,checkBeforeRead:check}),window});return receipt;
    });
  })().then(receipt=>{if(!receipt||typeof receipt!=='object'||textReads.get(receipt)?.original!==original)throw Error('gmail_text_unconfirmed');return receipt;}).catch(()=>{throw Error('gmail_text_unconfirmed');});
  textRequests.set(original,pending);return pending;
}
export function consumeGmailText<T>(receipt:GmailTextRead|undefined,run:(window:GmailTextWindow)=>Promise<T>):Promise<T>{
  const own=receipt&&textReads.get(receipt);if(!own)return Promise.reject(Error('gmail_text_unconfirmed'));
  return(own.promise??=Promise.resolve().then(async()=>{own.context.checkBeforeRead();const value=await run(own.window);own.context.checkBeforeRead();return value;})) as Promise<T>;
}
export function validateGmailTextRead(receipt:GmailTextRead|undefined):void{const own=receipt&&textReads.get(receipt);if(!own)throw Error('gmail_text_unconfirmed');own.context.checkBeforeRead();}
