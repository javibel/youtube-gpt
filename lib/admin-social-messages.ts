import { readNativeSessionCookie } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ADMIN_EMAIL } from '@/lib/admin-email';
import type { YoutubeCommentRead, YoutubeCommentWindow, YoutubeCommentSource } from '@/lib/agent/youtube-comment-original';
import type { GmailMetadataRead, GmailTextRead, GmailTextWindow, GmailTextSource } from '@/lib/agent/gmail-metadata-original';

declare const nativeAdminYoutubeComments: unique symbol;
export type NativeAdminYoutubeComments = { readonly [nativeAdminYoutubeComments]: true };
declare const nativeAdminGmailMetadata: unique symbol;
export type NativeAdminGmailMetadata = { readonly [nativeAdminGmailMetadata]: true };
declare const nativeAdminGmailText: unique symbol;
export type NativeAdminGmailText = {readonly [nativeAdminGmailText]:true};
type GmailTextContext = YoutubeReadContext & Readonly<{metadataPurpose:NativeAdminGmailMetadata;metadataRead:GmailMetadataRead}>;
const gmailTextPurposes = new WeakMap<object,{context:GmailTextContext;promise?:Promise<unknown>}>();
export function runAdminGmailText<T>(purpose:NativeAdminGmailText|undefined,run:(context:GmailTextContext)=>Promise<T>):Promise<T>{
  const own=purpose&&gmailTextPurposes.get(purpose);if(!own)return Promise.reject(Error('gmail_text_unconfirmed'));
  return(own.promise??=Promise.resolve().then(async()=>{own.context.checkBeforeRead();const value=await run(own.context);own.context.checkBeforeRead();return value;})) as Promise<T>;
}

// Explicit draft-source preparation is distinct from read,model and send.
// Only this native POST can mint the child;callbacks or a read receipt cannot.
declare const nativeAdminGmailDraft:unique symbol;
export type NativeAdminGmailDraftSource={readonly[nativeAdminGmailDraft]:true};
type DraftSourceContext=YoutubeReadContext&Readonly<{actorId:string;email:string;sessionRef:string;commandRef:string;source:GmailTextSource;validateBeforePrepare:()=>Promise<void>}>;
const gmailDraftPurposes=new WeakMap<object,{context:DraftSourceContext;promise?:Promise<unknown>}>();
export function runAdminGmailDraftSource<T>(purpose:NativeAdminGmailDraftSource|undefined,run:(context:DraftSourceContext)=>Promise<T>):Promise<T>{
 const own=purpose&&gmailDraftPurposes.get(purpose);if(!own)return Promise.reject(Error('gmail_draft_source_unconfirmed'));
 return(own.promise??=Promise.resolve().then(async()=>{await own.context.validateBeforePrepare();const value=await run(own.context);await own.context.validateBeforePrepare();return value;}))as Promise<T>;
}

// Only an explicit generation POST issues this child. Read/source inputs cannot.
declare const nativeGmailDraftGeneration:unique symbol;
export type NativeGmailDraftGeneration={readonly[nativeGmailDraftGeneration]:true};
type DraftGenerationContext=DraftSourceContext&Readonly<{verifiedAt:number;mailbox:string}>;
const gmailGenerationPurposes=new WeakMap<object,{context:DraftGenerationContext;promise?:Promise<unknown>}>();
export function runAdminGmailDraftGeneration<T>(purpose:NativeGmailDraftGeneration|undefined,run:(context:DraftGenerationContext)=>Promise<T>):Promise<T>{
 const own=purpose&&gmailGenerationPurposes.get(purpose);if(!own)return Promise.reject(Error('gmail_draft_generation_unconfirmed'));
 return(own.promise??=Promise.resolve().then(async()=>{await own.context.validateBeforePrepare();const value=await run(own.context);await own.context.validateBeforePrepare();return value;}))as Promise<T>;
}

// Manual YouTube generation is distinct from read,Gmail and reply/send.
declare const nativeAdminYoutubeDraft:unique symbol;
export type NativeAdminYoutubeDraft={readonly[nativeAdminYoutubeDraft]:true};
type YoutubeDraftContext=YoutubeReadContext&Readonly<{actorId:string;email:string;sessionRef:string;commandRef:string;verifiedAt:number;source:YoutubeCommentSource;validateBeforeGenerate:()=>Promise<void>;validateSource:()=>Promise<void>}>;
const youtubeDraftPurposes=new WeakMap<object,{context:YoutubeDraftContext;promise?:Promise<unknown>}>();
export function runAdminYoutubeDraft<T>(purpose:NativeAdminYoutubeDraft|undefined,run:(context:YoutubeDraftContext)=>Promise<T>):Promise<T>{
 const own=purpose&&youtubeDraftPurposes.get(purpose);if(!own)return Promise.reject(Error('youtube_draft_unconfirmed'));
 return(own.promise??=Promise.resolve().then(async()=>{await own.context.validateBeforeGenerate();const value=await run(own.context);await own.context.validateBeforeGenerate();return value;}))as Promise<T>;
}

type YoutubeReadContext = Readonly<{ at: number; signal: AbortSignal; checkBeforeRead: () => void; remainingBeforeRead: () => number }>;
const youtubePurposes = new WeakMap<object, { context: YoutubeReadContext; promise?: Promise<unknown> }>();
const gmailPurposes = new WeakMap<object, { context: YoutubeReadContext; promise?: Promise<unknown> }>();
const requests = new WeakMap<Request, Promise<Response>>(),draftRequests=new WeakMap<Request,Promise<Response>>(),generationRequests=new WeakMap<Request,Promise<Response>>(),youtubeDraftRequests=new WeakMap<Request,Promise<Response>>();

// A callback may consume only a purpose already issued inside the authenticated
// POST below. Neither callbacks nor serialized selectors can create that purpose.
export function runAdminYoutubeComments<T>(purpose: NativeAdminYoutubeComments | undefined, run: (context: YoutubeReadContext) => Promise<T>): Promise<T> {
  const own = purpose && youtubePurposes.get(purpose);
  if (!own) return Promise.reject(Error('youtube_comments_unconfirmed'));
  return (own.promise ??= Promise.resolve().then(async () => {
    own.context.checkBeforeRead(); const value = await run(own.context); own.context.checkBeforeRead(); return value;
  })) as Promise<T>;
}
// A distinct child of this POST carries metadata-read authority only.
export function runAdminGmailMetadata<T>(purpose: NativeAdminGmailMetadata | undefined, run: (context: YoutubeReadContext) => Promise<T>): Promise<T> {
  const own = purpose && gmailPurposes.get(purpose);
  if (!own) return Promise.reject(Error('gmail_metadata_unconfirmed'));
  return (own.promise ??= Promise.resolve().then(async () => {
    own.context.checkBeforeRead(); const value = await run(own.context); own.context.checkBeforeRead(); return value;
  })) as Promise<T>;
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const denied = () => Response.json({ ok: false, error: 'social_messages_unconfirmed' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
const messagesUnavailable = () => Response.json({ ok: false, error: 'social_messages_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

// Separate native actions own read,source preparation or generation purposes.
// None can issue a cron purpose,send intent or operative acceptance.
export function handleAdminSocialMessages(request:Request):Promise<Response>{return handleMessages(request,'read');}
export function handleAdminSocialMessagesDraftSource(request:Request):Promise<Response>{return handleMessages(request,'source');}
export function handleAdminSocialMessagesDraft(request:Request):Promise<Response>{return handleMessages(request,'generate');}
export function handleAdminSocialYoutubeDraft(request:Request):Promise<Response>{return handleMessages(request,'youtube');}
function handleMessages(request:Request,mode:'read'|'source'|'generate'|'youtube'):Promise<Response>{
  const isDraft=mode!=='read',isGeneration=mode==='generate',isYoutube=mode==='youtube';
  const originals=isYoutube?youtubeDraftRequests:isGeneration?generationRequests:isDraft?draftRequests:requests,commandHeader=isYoutube?'x-ytv-social-youtube-draft-command':isGeneration?'x-ytv-social-messages-draft-command':isDraft?'x-ytv-social-messages-draft-source-command':'x-ytv-social-messages-command';
  const unavailable=isDraft?()=>Response.json({ok:false,error:isYoutube?'social_youtube_draft_unavailable':isGeneration?'social_messages_draft_unavailable':'social_messages_draft_source_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}}):messagesUnavailable;
  const previous = originals.get(request);
  if (previous) return previous;
  const promise = (async () => {
    const at = Date.now(), started = performance.now(), config = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
    const adminConfig = process.env.ADMIN_EMAIL, secret = process.env.AUTH_SECRET, textEnabled=process.env.GMAIL_TEXT_READ_ENABLED,draftEnabled=process.env.MESSAGES_DRAFT_PREPARE_ENABLED,generationEnabled=process.env.MESSAGES_DRAFT_GENERATE_ENABLED,youtubeDraftEnabled=process.env.YOUTUBE_DRAFT_GENERATE_ENABLED;
    const cookie = request.headers.get('cookie'), command = request.headers.get(commandHeader);
    const headerOrigin = request.headers.get('origin'), contentType = request.headers.get('content-type'), url = request.url;
    let until = at + 55000, retired = false, timer: ReturnType<typeof setTimeout> | undefined, rejectStop!: (error: Error) => void;
    const stopped = new Promise<never>((_, reject) => { rejectStop = reject; });
    void stopped.catch(() => {});
    const retire = () => { if (retired) return; retired = true; clearTimeout(timer); rejectStop(Error('social_messages_unconfirmed')); };
    const check = () => {
      if (retired || request.signal.aborted || Date.now() < at || Date.now() >= until || performance.now() < started || performance.now() >= started + 55000
        || isYoutube&&process.env.YOUTUBE_DRAFT_GENERATE_ENABLED!==youtubeDraftEnabled || mode==='source'&&process.env.MESSAGES_DRAFT_PREPARE_ENABLED!==draftEnabled || isGeneration&&process.env.MESSAGES_DRAFT_GENERATE_ENABLED!==generationEnabled
        || (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL) !== config || process.env.ADMIN_EMAIL !== adminConfig || process.env.AUTH_SECRET !== secret || process.env.GMAIL_TEXT_READ_ENABLED !== textEnabled
        || request.method !== 'POST' || request.url !== url || request.headers.get('cookie') !== cookie || request.headers.get('origin') !== headerOrigin
        || request.headers.get('content-type') !== contentType || request.headers.get(commandHeader) !== command
        || ['x-ytv-resume','x-ytv-recovery','x-ytv-social-preview-command','x-ytv-social-publish-command','x-ytv-social-messages-command','x-ytv-social-messages-draft-source-command','x-ytv-social-messages-draft-command','x-ytv-social-youtube-draft-command'].some(key => key!==commandHeader&&request.headers.has(key))) throw Error('social_messages_unconfirmed');
    };
    const arm = () => { clearTimeout(timer); timer = setTimeout(retire, Math.max(0, Math.min(until - Date.now(), started + 55000 - performance.now()))); };
    const wait = async <T,>(run: () => Promise<T>): Promise<T> => {
      check();
      // Retiring the HTTP waiter does not cancel or replace an issued native IO.
      const pending = Promise.resolve().then(() => { check(); return run(); });
      void pending.catch(() => {});
      const value = await Promise.race([pending, stopped]); check(); return value;
    };
    request.signal.addEventListener('abort', retire, { once: true });
    arm();
    try {
      if (request.method !== 'POST' || request.signal.aborted || !config || !cookie || !uuid(command) || !contentType || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)
        || request.bodyUsed || !ADMIN_EMAIL || ADMIN_EMAIL.length > 254 || !/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(ADMIN_EMAIL)) return denied();
      check();
      const origin = new URL(config), target = new URL(url);
      if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
        || origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(origin.hostname))
        || target.origin !== origin.origin || target.pathname !== '/api/agent/run' || target.search || target.hash || headerOrigin !== origin.origin) return denied();
      const length = request.headers.get('content-length');
      if (length && (!/^\d+$/.test(length) || Number(length) > 1024)) return denied();
      const reader = request.body?.getReader(); if (!reader) return denied();
      const chunks: Uint8Array[] = []; let bytes = 0;
      let pendingRead: ReturnType<typeof reader.read> | undefined;
      const read = async () => { const pending = reader.read(); pendingRead = pending; try { return await pending; } finally { if (pendingRead === pending) pendingRead = undefined; } };
      try {
        for (;;) {
          const part = await wait(read);
          if (part.done) break;
          bytes += part.value.byteLength; if (bytes > 1024 || chunks.length >= 32) return denied();
          chunks.push(part.value);
        }
      } finally {
        const release = () => { try { reader.releaseLock(); } catch {} };
        if (pendingRead) void pendingRead.then(release, release); else release();
      }
      const raw = new Uint8Array(bytes); let position = 0;
      for (const chunk of chunks) { raw.set(chunk, position); position += chunk.byteLength; }
      const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
      if(!input||typeof input!=='object'||Array.isArray(input))return denied();
      if(isDraft){if(Object.keys(input).sort().join(',')!=='action,platform'||(input as {action:unknown}).action!==(isYoutube?'messages-youtube-draft':isGeneration?'messages-draft':'messages-draft-source')||(input as {platform:unknown}).platform!==(isYoutube?'youtube':'gmail'))return denied();}
      else if(Object.keys(input).join(',')!=='action'||(input as {action:unknown}).action!=='messages')return denied();
      const native = await wait(() => readNativeSessionCookie(new Request(new URL('/api/auth/session', origin.origin), { headers: { cookie }, signal: request.signal })));
      if (!native || typeof native !== 'object' || Array.isArray(native)) return denied();
      const { id, sub, email, authSessionRef, iat, exp, isAdmin, requiresVerification, requiresTotp } = native;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || sub !== id || email !== ADMIN_EMAIL || !uuid(authSessionRef)
        || isAdmin !== true || requiresVerification !== false || requiresTotp !== false
        || typeof iat !== 'number' || !Number.isSafeInteger(iat) || iat < 0 || iat > Date.now() / 1000
        || typeof exp !== 'number' || !Number.isSafeInteger(exp) || !Number.isSafeInteger(exp * 1000) || iat >= exp || exp * 1000 <= Date.now()) return denied();
      until = Math.min(until, exp * 1000); arm(); check();
      const account = await wait(() => prisma.user.findUnique({ where: { id }, select: { id: true, email: true, emailVerified: true } }));
      if (!account || account.id !== id || account.email !== email || !(account.emailVerified instanceof Date)
        || !Number.isFinite(account.emailVerified.getTime()) || account.emailVerified.getTime() < 0 || account.emailVerified.getTime() > at) return denied();
      const verifiedAt = account.emailVerified.getTime();
      check();
      if(mode==='source'&&draftEnabled!=='true'||isGeneration&&generationEnabled!=='true'||isYoutube&&youtubeDraftEnabled!=='true')return unavailable();
      let youtubeSource:YoutubeCommentSource|undefined,validateDraftSource:((receipt:YoutubeCommentRead,source:YoutubeCommentSource)=>Promise<void>)|undefined;
      let receipt:YoutubeCommentRead|undefined,coverage:Omit<YoutubeCommentWindow,'comments'>|undefined,validateYoutubeCommentsRead:((value:YoutubeCommentRead)=>void)|undefined;
      if(!isDraft||isYoutube){
        const purpose=Object.freeze({})as NativeAdminYoutubeComments;
        youtubePurposes.set(purpose,{context:Object.freeze({at,signal:request.signal,checkBeforeRead:check,remainingBeforeRead:()=>{check();return Math.min(until-Date.now(),started+55000-performance.now());}})});
        const reader=await wait(()=>import('@/lib/agent/youtube-comment-original'));
        receipt=await wait(()=>reader.readAdminYoutubeComments(purpose));
        coverage=await wait(()=>reader.consumeYoutubeComments(receipt,async({comments,...window})=>{if(isYoutube)youtubeSource=comments.find(v=>v.canReply);return Object.freeze(window);}));
        validateYoutubeCommentsRead=reader.validateYoutubeCommentsRead;validateDraftSource=reader.validateAdminYoutubeDraftComment;
      }
      if(isYoutube){
        if(!receipt||!youtubeSource||!coverage?.configured)return unavailable();
        const live=()=>{check();validateYoutubeCommentsRead!(receipt!);};
        const validateBeforeGenerate=async()=>{live();const row=await prisma.user.findUnique({where:{id},select:{id:true,email:true,emailVerified:true}});live();if(!row||row.id!==id||row.email!==email||!(row.emailVerified instanceof Date)||row.emailVerified.getTime()!==verifiedAt)throw Error('youtube_draft_unconfirmed');};
        await wait(validateBeforeGenerate);
        const source=youtubeSource,purpose=Object.freeze({})as NativeAdminYoutubeDraft;
        youtubeDraftPurposes.set(purpose,{context:Object.freeze({actorId:id,email,sessionRef:authSessionRef,commandRef:command,verifiedAt,source,at,signal:request.signal,checkBeforeRead:live,remainingBeforeRead:()=>{live();return Math.min(until-Date.now(),started+55000-performance.now());},validateBeforeGenerate,validateSource:()=>validateDraftSource!(receipt!,source)})});
        const producer=await wait(()=>import('@/lib/agent/youtube-draft-original'));
        const result=await wait(()=>producer.generateAdminYoutubeDraft(purpose));
        const projection=await wait(()=>producer.consumeAdminYoutubeDraft(result,async draft=>{
          const source=draft.comment,points=Array.from(source.authorName),author=points.length>512?points.slice(0,512).join('')+'…':source.authorName;
          return Object.freeze({summary:Object.freeze({generated:1,platform:'youtube',acceptance:'private-draft-only-no-reply-or-operative-acceptance'}),view:Object.freeze({platform:'youtube',source:Object.freeze({channelId:source.channelId,commentId:source.commentId,threadId:source.threadId,videoId:source.videoId,author,text:source.text,publishedAt:source.publishedAt,updatedAt:source.updatedAt}),content:draft.content,acceptance:'private-draft-view-only-no-reply-or-operative-acceptance'})});
        }));
        live();const body=JSON.stringify({ok:false,error:'social_youtube_draft_unavailable',youtubeDraft:projection.summary,youtubeDraftView:projection.view,youtubeDraftRead:{commandRef:command,userId:id,email,sessionRef:authSessionRef,asOf:at,expiresAt:until}});
        if(new TextEncoder().encode(body).byteLength>65536)return unavailable();
        live();const response=new Response(body,{status:503,headers:{'Cache-Control':'no-store','Content-Type':'application/json'}});live();return response;
      }
      const gmailPurpose = Object.freeze({}) as NativeAdminGmailMetadata;
      gmailPurposes.set(gmailPurpose, { context: Object.freeze({ at, signal: request.signal, checkBeforeRead: check,
        remainingBeforeRead: () => { check(); return Math.min(until - Date.now(), started + 55000 - performance.now()); } }) });
      const { readGmailMetadata, consumeGmailMetadata, validateGmailMetadataRead, readGmailText, consumeGmailText, validateGmailTextRead, gmailTextViewExpiresAt } = await wait(() => import('@/lib/agent/gmail-metadata-original'));
      const gmailReceipt = await wait(() => readGmailMetadata(gmailPurpose));
      const gmail = await wait(() => consumeGmailMetadata(gmailReceipt, async ({ messages: _messages, ...window }) => Object.freeze(window)));
      if (!coverage?.configured && !gmail.configured) return unavailable();
      let textReceipt:GmailTextRead|undefined,textCoverage:Omit<GmailTextWindow,'messages'>|undefined,textPurpose:NativeAdminGmailText|undefined,draftSource:GmailTextSource|undefined;
      if(textEnabled==='true'&&gmail.configured){
        textPurpose=Object.freeze({}) as NativeAdminGmailText;
        gmailTextPurposes.set(textPurpose,{context:Object.freeze({...gmailPurposes.get(gmailPurpose)!.context,metadataPurpose:gmailPurpose,metadataRead:gmailReceipt})});
        textReceipt=await wait(()=>readGmailText(textPurpose!));
        textCoverage=await wait(()=>consumeGmailText(textReceipt,async({messages,...window})=>{if(isDraft)draftSource=messages[0];return Object.freeze(window);}));
      }
      // Re-reading the original account is a veto after network/body waits. It
      // cannot renew the session, verification date or original request budget.
      const current = await wait(() => prisma.user.findUnique({ where: { id }, select: { id: true, email: true, emailVerified: true } }));
      if (!current || current.id !== id || current.email !== email || !(current.emailVerified instanceof Date)
        || current.emailVerified.getTime() !== verifiedAt) return denied();
      check();
      if(receipt)validateYoutubeCommentsRead!(receipt); validateGmailMetadataRead(gmailReceipt);if(textReceipt)validateGmailTextRead(textReceipt);
      if(isDraft){
        if(isGeneration&&textReceipt&&textCoverage?.configured&&textCoverage.read===0&&!draftSource){
          // A successful bounded read with no eligible source is a private
          // explanation only. Never enter admission,task,model or draft input.
          const expiresAt=Math.min(until,gmailTextViewExpiresAt(textReceipt));
          const response=Response.json({ok:false,error:'social_messages_draft_unavailable',
            gmailDraftUnavailable:{platform:'gmail',reason:'no-eligible-source',scanned:gmail.scanned,hasMore:gmail.hasMore,
              exclusions:textCoverage.exclusions,coverage:'at-most-ten-unread-inbox-messages-one-list-page',
              acceptance:'private-coverage-only-no-draft-send-or-operative-acceptance'},
            gmailDraftRead:{commandRef:command,userId:id,email,sessionRef:authSessionRef,asOf:at,expiresAt}},
            {status:503,headers:{'Cache-Control':'no-store'}});
          check();validateGmailMetadataRead(gmailReceipt);validateGmailTextRead(textReceipt);return response;
        }
        if(!textReceipt||!draftSource||textEnabled!=='true')return unavailable();
        const live=()=>{check();validateGmailMetadataRead(gmailReceipt);validateGmailTextRead(textReceipt);};
        const validateBeforePrepare=async()=>{live();const row=await prisma.user.findUnique({where:{id},select:{id:true,email:true,emailVerified:true}});live();if(!row||row.id!==id||row.email!==email||!(row.emailVerified instanceof Date)||row.emailVerified.getTime()!==verifiedAt)throw Error('gmail_draft_source_unconfirmed');};
        if(isGeneration){
          const purpose=Object.freeze({})as NativeGmailDraftGeneration;
          gmailGenerationPurposes.set(purpose,{context:Object.freeze({actorId:id,email,sessionRef:authSessionRef,commandRef:command,source:draftSource,verifiedAt,mailbox:process.env.GMAIL_READ_MAILBOX!,at,signal:request.signal,checkBeforeRead:live,remainingBeforeRead:()=>{live();return Math.min(until-Date.now(),started+55000-performance.now());},validateBeforePrepare})});
          const producer=await wait(()=>import('@/lib/agent/gmail-draft-generation'));
          const result=await wait(()=>producer.generateGmailDraft(purpose));
          const projection=await wait(()=>producer.consumeGmailDraft(result,async draft=>{
            const header=(name:string)=>{const value=draft.message.source.headers.find(v=>v.name.toLowerCase()===name)?.value??'',points=Array.from(value);return points.length>512?points.slice(0,512).join('')+'…':value;};
            return Object.freeze({summary:Object.freeze({generated:1,platform:'gmail',acceptance:'private-draft-only-no-send-or-operative-acceptance'}),view:Object.freeze({platform:'gmail',source:Object.freeze({from:header('from'),subject:header('subject'),text:draft.message.text}),content:draft.content,acceptance:'private-draft-view-only-no-send-or-operative-acceptance'})});
          }));
          live();const expiresAt=Math.min(until,gmailTextViewExpiresAt(textReceipt));
          const body=JSON.stringify({ok:false,error:'social_messages_draft_unavailable',gmailDraft:projection.summary,gmailDraftView:projection.view,gmailDraftRead:{commandRef:command,userId:id,email,sessionRef:authSessionRef,asOf:at,expiresAt}});
          if(new TextEncoder().encode(body).byteLength>65536)return unavailable();
          live();const response=new Response(body,{status:503,headers:{'Cache-Control':'no-store','Content-Type':'application/json'}});live();return response;
        }
        const purpose=Object.freeze({})as NativeAdminGmailDraftSource;
        gmailDraftPurposes.set(purpose,{context:Object.freeze({actorId:id,email,sessionRef:authSessionRef,commandRef:command,source:draftSource,at,signal:request.signal,checkBeforeRead:live,remainingBeforeRead:()=>{live();return Math.min(until-Date.now(),started+55000-performance.now());},validateBeforePrepare})});
        const preparer=await wait(()=>import('@/lib/agent/gmail-draft-original'));
        const inputReceipt=await wait(()=>preparer.prepareGmailDraftInput(purpose));
        const inputCoverage=await wait(()=>preparer.consumeGmailDraftInput(inputReceipt,async()=>Object.freeze({prepared:1,platform:'gmail',acceptance:'source-only-no-model-draft-send-or-operative-acceptance'})));
        live();
        // Source readiness is not a generated draft or review success. The
        // future model producer must own its admission and original result.
        const response=Response.json({ok:false,error:'social_messages_draft_source_unavailable',gmailDraft:inputCoverage},{status:503,headers:{'Cache-Control':'no-store'}});live();return response;
      }
      const response = Response.json({ ok: false, error: 'social_messages_unavailable',
        youtube: coverage?.configured ? { status: 'read-only', coverage } : { status: 'unavailable' },
        gmail: gmail.configured ? { status: 'read-only-metadata', coverage: gmail } : { status: 'unavailable' },
        ...(textCoverage?{gmailText:textCoverage}:{}),
        messagesRead: { commandRef: command, userId: id, email, sessionRef: authSessionRef, asOf: at, expiresAt: until } },
        { status: 503, headers: { 'Cache-Control': 'no-store' } });
      check(); return response;
    } catch { return unavailable(); }
    finally { retire(); request.signal.removeEventListener('abort', retire); }
  })();
  originals.set(request, promise); return promise;
}
