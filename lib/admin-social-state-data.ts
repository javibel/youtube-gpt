export type SocialStateData = Readonly<{
  posts: readonly Readonly<{ id:string; platform:string; content:string; status:string; errorMsg:string|null; createdAt:string }>[];
  messages: readonly Readonly<{ id:string; platform:string; fromUser:string; content:string; externalId:string|null; receivedAt:string; replied:boolean }>[];
  status: Readonly<Record<'youtube'|'gmail'|'facebook'|'instagram'|'tiktok'|'twitter','configured'|'not-configured'|'disabled'|'manual'>>;
  quality: 'stored-history-configuration-only-no-provider-health';
}>;
export const stateObject = (v:unknown,keys:string[]):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v)
  && Object.keys(v).length===keys.length && keys.every(k=>Object.hasOwn(v,k));
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length<=max&&!/[\x00\x7f]/.test(v);
const id=(v:unknown):v is string=>text(v,128)&&/^[A-Za-z0-9_-]+$/.test(v);
const iso=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const frozen=<T,>(v:T):T=>{if(v&&typeof v==='object'){for(const x of Object.values(v))frozen(x);Object.freeze(v);}return v;};
// Only data validation. It cannot mint a display handle,authenticate or recover.
export function decodeSocialState(v:unknown):SocialStateData {
  if(!stateObject(v,['posts','messages','status','quality','socialStateRead'])||v.quality!=='stored-history-configuration-only-no-provider-health')throw Error('social_state_unconfirmed');
  const {posts:p,messages:m,status:s}=v;
  if(!Array.isArray(p)||p.length>20||!p.every(r=>stateObject(r,['id','platform','content','status','errorMsg','createdAt'])&&id(r.id)&&text(r.platform,64)&&r.platform.length>0&&text(r.content,16384)&&text(r.status,64)&&r.status.length>0&&(r.errorMsg===null||text(r.errorMsg,2048))&&iso(r.createdAt))
    ||new Set(p.map(r=>r.id)).size!==p.length||p.some((r,n)=>n>0&&Date.parse(r.createdAt)>Date.parse(p[n-1].createdAt)))throw Error('social_state_unconfirmed');
  if(!Array.isArray(m)||m.length>20||!m.every(r=>stateObject(r,['id','platform','fromUser','content','externalId','receivedAt','replied'])&&id(r.id)&&text(r.platform,64)&&r.platform.length>0&&text(r.fromUser,512)&&text(r.content,16384)&&(r.externalId===null||text(r.externalId,256))&&iso(r.receivedAt)&&typeof r.replied==='boolean')
    ||new Set(m.map(r=>r.id)).size!==m.length||m.some((r,n)=>n>0&&Date.parse(r.receivedAt)>Date.parse(m[n-1].receivedAt)))throw Error('social_state_unconfirmed');
  if(!stateObject(s,['youtube','gmail','facebook','instagram','tiktok','twitter'])||!['configured','not-configured'].includes(s.youtube as string)||!['configured','not-configured','disabled'].includes(s.gmail as string)
    ||!['configured','not-configured'].includes(s.facebook as string)||!['configured','not-configured'].includes(s.instagram as string)||s.tiktok!=='manual'||s.twitter!=='manual')throw Error('social_state_unconfirmed');
  return frozen({posts:p,messages:m,status:s,quality:v.quality} as unknown as SocialStateData);
}
