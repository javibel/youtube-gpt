import { timingSafeEqual } from 'node:crypto';

declare const nativeCronDispatch: unique symbol;
export type NativeCronDispatch = { readonly [nativeCronDispatch]: true };
declare const nativeCronDailyTip: unique symbol;
export type NativeCronDailyTip = { readonly [nativeCronDailyTip]: true };
declare const nativeCronDailyIdeas: unique symbol;
export type NativeCronDailyIdeas = { readonly [nativeCronDailyIdeas]: true };
declare const nativeCronDailyIdeasEmail: unique symbol;
export type NativeCronDailyIdeasEmail = { readonly [nativeCronDailyIdeasEmail]: true };
declare const nativeCronSocialPost: unique symbol;
export type NativeCronSocialPost = { readonly [nativeCronSocialPost]: true };
declare const nativeCronBrandImageRead: unique symbol;
export type NativeCronBrandImageRead = { readonly [nativeCronBrandImageRead]: true };
declare const nativeCronMorningSocial: unique symbol;
export type NativeCronMorningSocial = { readonly [nativeCronMorningSocial]: true };
declare const nativeCronVerificationReminders:unique symbol;
export type NativeCronVerificationReminders={readonly[nativeCronVerificationReminders]:true};
declare const nativeCronReengagement:unique symbol;
export type NativeCronReengagement={readonly[nativeCronReengagement]:true};
declare const nativeCronYoutubeComments:unique symbol;
export type NativeCronYoutubeComments={readonly[nativeCronYoutubeComments]:true};
declare const nativeCronYoutubeReplies:unique symbol;
export type NativeCronYoutubeReplies={readonly[nativeCronYoutubeReplies]:true};
declare const nativeCronFeedback:unique symbol;
export type NativeCronFeedback={readonly[nativeCronFeedback]:true};

type MorningSocialContext=Readonly<{facebook:NativeCronSocialPost;instagram:NativeCronSocialPost;facebookRead:NativeCronBrandImageRead;instagramRead:NativeCronBrandImageRead;checkBeforeDispatch:()=>void}>;
type Slot = 'morning' | 'evening';
type Original = { request: Request; url: string; slot: Slot; secret: string; configured: string; header: string;
  at: number; until: number; started: number; deadline: number; used: boolean };
const originals = new WeakMap<object, Original>();
const dailyTips = new WeakMap<object, { date: string; check: () => void; promise?: Promise<unknown> }>();
const dailyIdeas = new WeakMap<object, { date: string; check: () => void; promise?: Promise<unknown> }>();
const dailyIdeasEmails = new WeakMap<object, { date: string; at: number; check: () => void; promise?: Promise<unknown> }>();
const socialPosts = new WeakMap<object, { parent: Original; date: string; at: number; slot: Slot; platform: 'facebook'|'instagram'; remaining: () => number; check: () => void; promise?: Promise<string> }>();
const imageReads = new WeakMap<object, { parent: Original; source?:NativeCronSocialPost; date: string; check: () => void; promise?: Promise<unknown> }>();
const youtubeReplies=new WeakMap<object,{readPurpose:NativeCronYoutubeComments;check:()=>void;promise?:Promise<unknown>}>();
const youtubeComments=new WeakMap<object,{parent:Original;at:number;signal:AbortSignal;check:()=>void;remaining:()=>number;promise?:Promise<unknown>}>();
const feedbacks=new WeakMap<object,{at:number;check:()=>void;promise?:Promise<unknown>}>();
const reengagements=new WeakMap<object,{at:number;check:()=>void;promise?:Promise<unknown>}>();
const verificationReminders=new WeakMap<object,{at:number;check:()=>void;promise?:Promise<unknown>}>();
const morningSocials=new WeakMap<object,{context:MorningSocialContext;promise?:Promise<unknown>}>();

export function authorizeCronDispatch(request: Request, slot: Slot): NativeCronDispatch | null {
  try {
    const secret = process.env.CRON_SECRET, configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
    const header = request.headers.get('authorization');
    if (!['morning', 'evening'].includes(slot) || !secret || secret.length < 16 || secret.length > 4096
      || /[\r\n]/.test(secret) || !configured || !header || request.method !== 'GET' || request.signal.aborted) return null;
    const url = new URL(request.url), origin = new URL(configured), expected = 'Bearer ' + secret;
    if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
      || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))
      || url.origin !== origin.origin || url.pathname !== '/api/cron/' + slot || url.search || url.hash
      || request.headers.has('x-ytv-resume') || request.headers.has('x-ytv-recovery')
      || Buffer.byteLength(header) !== Buffer.byteLength(expected)
      || !timingSafeEqual(Buffer.from(header), Buffer.from(expected))) return null;
    const at = Date.now(), started = performance.now(), lifetime = slot === 'morning' ? 115000 : 55000;
    const original = Object.freeze({}) as NativeCronDispatch;
    originals.set(original, { request, url: request.url, slot, secret, configured, header, at, until: at + lifetime,
      started, deadline: started + lifetime, used: false });
    return original;
  } catch { return null; }
}

// This owns only entry into the next cron job. It neither admits downstream
// writers nor resumes/cancels work already invoked. Await that same promise;
// its own native producer/receipt retains responsibility for completion.
export async function runCronDispatch<T>(original: NativeCronDispatch | null,
  run: (step: <V>(work: () => Promise<V>) => Promise<V>, issueDailyTip: () => NativeCronDailyTip, issueDailyIdeas: () => NativeCronDailyIdeas,
    issueDailyIdeasEmail: () => NativeCronDailyIdeasEmail,
    issueSocialPost: (platform: 'facebook'|'instagram') => NativeCronSocialPost,
    issueBrandImageRead: () => NativeCronBrandImageRead,
    issueMorningSocial: () => NativeCronMorningSocial, issueVerificationReminders:()=>NativeCronVerificationReminders,issueReengagement:()=>NativeCronReengagement,issueYoutubeComments:()=>NativeCronYoutubeComments,issueYoutubeReplies:(read:NativeCronYoutubeComments)=>NativeCronYoutubeReplies,issueFeedback:()=>NativeCronFeedback) => Promise<T>): Promise<T> {
  const own = original && originals.get(original);
  if (!own || own.used) throw Error('cron_invocation_unconfirmed');
  own.used = true;
  let retired = false;
  const check = () => {
    if (retired || own.request.signal.aborted || Date.now() < own.at || Date.now() >= own.until
      || performance.now() < own.started || performance.now() >= own.deadline
      || own.request.method !== 'GET' || own.request.url !== own.url
      || own.request.headers.has('x-ytv-resume') || own.request.headers.has('x-ytv-recovery')
      || process.env.CRON_SECRET !== own.secret
      || (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL) !== own.configured
      || own.request.headers.get('authorization') !== own.header) {
      retired = true;
      throw Error('cron_invocation_unconfirmed');
    }
  };
  const step = async <V>(work: () => Promise<V>): Promise<V> => {
    check();
    const result = await work();
    check();
    return result;
  };
  let issued = false;
  const issueDailyTip = (): NativeCronDailyTip => {
    check();
    if (own.slot !== 'morning' || issued) throw Error('daily_tip_unconfirmed');
    issued = true;
    const child = Object.freeze({}) as NativeCronDailyTip;
    // Original UTC day is fixed. A date/body/SQL row cannot issue this child.
    const date = new Date(own.at).toISOString().slice(0, 10);
    dailyTips.set(child, { date, check: () => {
      check();
      if (new Date(Date.now()).toISOString().slice(0, 10) !== date) throw Error('daily_tip_unconfirmed');
    } });
    return child;
  };
  let ideasIssued = false;
  const issueDailyIdeas = (): NativeCronDailyIdeas => {
    check();
    if (own.slot !== 'morning' || ideasIssued) throw Error('daily_ideas_unconfirmed');
    ideasIssued = true;
    const child = Object.freeze({}) as NativeCronDailyIdeas;
    const date = new Date(own.at).toISOString().slice(0, 10);
    dailyIdeas.set(child, { date, check: () => {
      check();
      if (new Date(Date.now()).toISOString().slice(0, 10) !== date) throw Error('daily_ideas_unconfirmed');
    } });
    return child;
  };
  let emailIssued = false;
  const issueDailyIdeasEmail = (): NativeCronDailyIdeasEmail => {
    check();
    if (own.slot !== 'morning' || emailIssued) throw Error('daily_ideas_email_unconfirmed');
    emailIssued = true;
    const child = Object.freeze({}) as NativeCronDailyIdeasEmail;
    const date = new Date(own.at).toISOString().slice(0, 10);
    dailyIdeasEmails.set(child, { date, at: own.at, check: () => {
      check();
      if (new Date(Date.now()).toISOString().slice(0, 10) !== date) throw Error('daily_ideas_email_unconfirmed');
    } });
    return child;
  };
  const platforms = new Set<string>();
  const issueSocialPost = (platform: 'facebook'|'instagram'): NativeCronSocialPost => {
    check();
    if (!['facebook','instagram'].includes(platform) || (own.slot==='evening' && platform!=='instagram') || platforms.has(platform)) throw Error('social_post_unconfirmed');
    platforms.add(platform);
    const child=Object.freeze({}) as NativeCronSocialPost, date=new Date(own.at).toISOString().slice(0,10);
    const checkSocial=()=>{check();if(new Date(Date.now()).toISOString().slice(0,10)!==date)throw Error('social_post_unconfirmed');};
    socialPosts.set(child,{parent:own,date,at:own.at,slot:own.slot,platform,check:checkSocial,
      remaining:()=>{checkSocial();return Math.max(1,Math.floor(Math.min(own.until-Date.now(),own.deadline-performance.now())));}});
    return child;
  };
  let imageReadIssued = false;
  const createBrandImageRead = (source?:NativeCronSocialPost): NativeCronBrandImageRead => {
    check();
    const child = Object.freeze({}) as NativeCronBrandImageRead;
    const date = new Date(own.at).toISOString().slice(0, 10);
    imageReads.set(child, { parent: own, source, date, check: () => {
      check();
      if (new Date(Date.now()).toISOString().slice(0, 10) !== date) throw Error('daily_brand_image_read_unconfirmed');
    } });
    return child;
  };
  const issueBrandImageRead=()=>{check();if(imageReadIssued)throw Error('daily_brand_image_read_unconfirmed');imageReadIssued=true;return createBrandImageRead();};
  // A morning-only lexical owner issues exactly these two sources and two
  // source-bound data readers. It cannot mix with separately issued children.
  const issueMorningSocial=():NativeCronMorningSocial=>{
    check();if(own.slot!=='morning'||platforms.size||imageReadIssued)throw Error('social_publish_unconfirmed');
    const facebook=issueSocialPost('facebook'),instagram=issueSocialPost('instagram');imageReadIssued=true;
    const facebookRead=createBrandImageRead(facebook),instagramRead=createBrandImageRead(instagram),cap=Object.freeze({})as NativeCronMorningSocial;
    const checkBeforeDispatch=()=>{check();validateCronImageReadSource(facebook,facebookRead);validateCronImageReadSource(instagram,instagramRead);};
    morningSocials.set(cap,{context:Object.freeze({facebook,instagram,facebookRead,instagramRead,checkBeforeDispatch})});return cap;
  };
  let remindersIssued=false;
  const issueVerificationReminders=():NativeCronVerificationReminders=>{check();if(own.slot!=='morning'||remindersIssued)throw Error('verification_reminder_unconfirmed');remindersIssued=true;const cap=Object.freeze({})as NativeCronVerificationReminders,date=new Date(own.at).toISOString().slice(0,10);verificationReminders.set(cap,{at:own.at,check:()=>{check();if(new Date(Date.now()).toISOString().slice(0,10)!==date)throw Error('verification_reminder_unconfirmed');}});return cap;};
  let reengagementIssued=false;
  const issueReengagement=():NativeCronReengagement=>{check();if(own.slot!=='morning'||reengagementIssued)throw Error('reengagement_unconfirmed');reengagementIssued=true;const cap=Object.freeze({})as NativeCronReengagement,date=new Date(own.at).toISOString().slice(0,10);reengagements.set(cap,{at:own.at,check:()=>{check();if(new Date(Date.now()).toISOString().slice(0,10)!==date)throw Error('reengagement_unconfirmed');}});return cap;};
  let youtubeCommentsIssued=false;
  const issueYoutubeComments=():NativeCronYoutubeComments=>{check();if(own.slot!=='evening'||youtubeCommentsIssued)throw Error('youtube_comments_unconfirmed');youtubeCommentsIssued=true;const cap=Object.freeze({})as NativeCronYoutubeComments,date=new Date(own.at).toISOString().slice(0,10),live=()=>{check();if(new Date(Date.now()).toISOString().slice(0,10)!==date)throw Error('youtube_comments_unconfirmed');};youtubeComments.set(cap,{parent:own,at:own.at,signal:own.request.signal,check:live,remaining:()=>{live();return Math.min(own.until-Date.now(),own.deadline-performance.now());}});return cap;};
  let youtubeRepliesIssued=false;
  const issueYoutubeReplies=(readPurpose:NativeCronYoutubeComments):NativeCronYoutubeReplies=>{check();const read=readPurpose&&youtubeComments.get(readPurpose);if(own.slot!=='evening'||youtubeRepliesIssued||!read||read.parent!==own)throw Error('youtube_reply_unconfirmed');read.check();youtubeRepliesIssued=true;const cap=Object.freeze({})as NativeCronYoutubeReplies;youtubeReplies.set(cap,{readPurpose,check:read.check});return cap;};
  let feedbackIssued=false;
  const issueFeedback=():NativeCronFeedback=>{check();if(own.slot!=='evening'||feedbackIssued)throw Error('feedback_batch_unconfirmed');feedbackIssued=true;const cap=Object.freeze({})as NativeCronFeedback,date=new Date(own.at).toISOString().slice(0,10);feedbacks.set(cap,{at:own.at,check:()=>{check();if(new Date(Date.now()).toISOString().slice(0,10)!==date)throw Error('feedback_batch_unconfirmed');}});return cap;};
  try { check(); const result = await run(step, issueDailyTip, issueDailyIdeas, issueDailyIdeasEmail, issueSocialPost, issueBrandImageRead, issueMorningSocial,issueVerificationReminders,issueReengagement,issueYoutubeComments,issueYoutubeReplies,issueFeedback); check(); return result; }
  finally { retired = true; }
}

// A fresh authenticated GET may read today's resource. This purpose carries no
// producer completion, retry, upload or publication authority from the old GET.
export function runCronBrandImageRead<T>(original: NativeCronBrandImageRead | undefined,
  run: (context: { date: string; checkBeforeRead: () => void }) => Promise<T>): Promise<T> {
  const own = original && imageReads.get(original);
  if (!own) return Promise.reject(Error('daily_brand_image_read_unconfirmed'));
  return (own.promise ??= Promise.resolve().then(() => {
    own.check();
    return run({ date: own.date, checkBeforeRead: own.check });
  })) as Promise<T>;
}

// Identity of two live children of this very invocation;not equality of request
// metadata or a way to bind a new read purpose to an older producer.
export function validateCronImageReadSource(source: NativeCronSocialPost | undefined, read: NativeCronBrandImageRead | undefined): void {
  const post = source && socialPosts.get(source), image = read && imageReads.get(read);
  if (!post || !image || post.parent !== image.parent || (image.source!==undefined&&image.source!==source)) throw Error('daily_brand_image_unconfirmed');
  post.check(); image.check();
}

// A date, DTO, row or a pair of independently authorized Requests cannot issue
// this owner. Only the same live morning invocation may enter its one promise.
export function runCronMorningSocial<T>(original:NativeCronMorningSocial|undefined,run:(context:MorningSocialContext)=>Promise<T>):Promise<T>{
  const own=original&&morningSocials.get(original);if(!own)return Promise.reject(Error('social_publish_unconfirmed'));
  return(own.promise??=Promise.resolve().then(async()=>{own.context.checkBeforeDispatch();const result=await run(own.context);own.context.checkBeforeDispatch();return result;}))as Promise<T>;
}

export function runCronSocialPost(original: NativeCronSocialPost|undefined, platform: string, slot: string,
  run: (context:{date:string;at:number;signal:AbortSignal;platform:'facebook'|'instagram';slot:Slot;checkBeforeDispatch:()=>void;remainingBeforeDispatch:()=>number})=>Promise<string>):Promise<string> {
  const own=original&&socialPosts.get(original);
  if(!own || own.platform!==platform || own.slot!==slot)return Promise.reject(Error('social_post_unconfirmed'));
  return own.promise??=Promise.resolve().then(()=>{own.check();return run({date:own.date,at:own.at,signal:own.parent.request.signal,platform:own.platform,slot:own.slot,checkBeforeDispatch:own.check,remainingBeforeDispatch:own.remaining});});
}

export function runCronDailyIdeasEmail<T>(original: NativeCronDailyIdeasEmail | undefined,
  run: (context: { date: string; at: number; checkBeforeDispatch: () => void }) => Promise<T>): Promise<T> {
  const own = original && dailyIdeasEmails.get(original);
  if (!own) return Promise.reject(Error('daily_ideas_email_unconfirmed'));
  return (own.promise ??= Promise.resolve().then(() => {
    own.check();
    return run({ date: own.date, at: own.at, checkBeforeDispatch: own.check });
  })) as Promise<T>;
}

// Batch purpose is private to the live morning invocation. Its lexical scan and
// each producer still require their own native SQL source and INSERT ACK.
export function runCronDailyIdeas<T>(original: NativeCronDailyIdeas | undefined,
  run: (context: { date: string; checkBeforeDispatch: () => void }) => Promise<T>): Promise<T> {
  const own = original && dailyIdeas.get(original);
  if (!own) return Promise.reject(Error('daily_ideas_unconfirmed'));
  return (own.promise ??= Promise.resolve().then(() => {
    own.check();
    return run({ date: own.date, checkBeforeDispatch: own.check });
  })) as Promise<T>;
}

// Same child joins the same original producer. Only a live morning GET can
// issue it; JSON, an old date, a reservation or another module cannot do so.
export function runCronDailyTip<T>(original: NativeCronDailyTip,
  run: (context: { date: string; checkBeforeDispatch: () => void }) => Promise<T>): Promise<T> {
  const own = original && dailyTips.get(original);
  if (!own) return Promise.reject(Error('daily_tip_unconfirmed'));
  return (own.promise ??= Promise.resolve().then(() => {
    own.check();
    return run({ date: own.date, checkBeforeDispatch: own.check });
  })) as Promise<T>;
}

export function runCronVerificationReminders<T>(original:NativeCronVerificationReminders|undefined,run:(context:Readonly<{at:number;checkBeforeDispatch:()=>void}>)=>Promise<T>):Promise<T>{
 const own=original&&verificationReminders.get(original);if(!own)return Promise.reject(Error('verification_reminder_unconfirmed'));
 return(own.promise??=Promise.resolve().then(async()=>{own.check();const result=await run(Object.freeze({at:own.at,checkBeforeDispatch:own.check}));own.check();return result;}))as Promise<T>;
}

export function runCronReengagement<T>(original:NativeCronReengagement|undefined,run:(context:Readonly<{at:number;checkBeforeDispatch:()=>void}>)=>Promise<T>):Promise<T>{
 const own=original&&reengagements.get(original);if(!own)return Promise.reject(Error('reengagement_unconfirmed'));
 return(own.promise??=Promise.resolve().then(async()=>{own.check();const result=await run(Object.freeze({at:own.at,checkBeforeDispatch:own.check}));own.check();return result;}))as Promise<T>;
}

export function runCronYoutubeComments<T>(original:NativeCronYoutubeComments|undefined,run:(context:Readonly<{at:number;signal:AbortSignal;checkBeforeRead:()=>void;remainingBeforeRead:()=>number}>)=>Promise<T>):Promise<T>{
 const own=original&&youtubeComments.get(original);if(!own)return Promise.reject(Error('youtube_comments_unconfirmed'));
 return(own.promise??=Promise.resolve().then(async()=>{own.check();const result=await run(Object.freeze({at:own.at,signal:own.signal,checkBeforeRead:own.check,remainingBeforeRead:own.remaining}));own.check();return result;}))as Promise<T>;
}

export function runCronYoutubeReplies<T>(original:NativeCronYoutubeReplies|undefined,run:(context:Readonly<{readPurpose:NativeCronYoutubeComments;checkBeforeEffect:()=>void}>)=>Promise<T>):Promise<T>{
 const own=original&&youtubeReplies.get(original);if(!own)return Promise.reject(Error('youtube_reply_unconfirmed'));
 return(own.promise??=Promise.resolve().then(async()=>{own.check();const result=await run(Object.freeze({readPurpose:own.readPurpose,checkBeforeEffect:own.check}));own.check();return result;}))as Promise<T>;
}

export function runCronFeedback<T>(original:NativeCronFeedback|undefined,run:(context:Readonly<{at:number;checkBeforeDispatch:()=>void}>)=>Promise<T>):Promise<T>{
 const own=original&&feedbacks.get(original);if(!own)return Promise.reject(Error('feedback_batch_unconfirmed'));
 return(own.promise??=Promise.resolve().then(async()=>{own.check();const value=await run(Object.freeze({at:own.at,checkBeforeDispatch:own.check}));own.check();return value;}))as Promise<T>;
}
