// Same-tab continuity of the last pending AI request only. Stored input/key is
// untrusted: recovery always uses the server's retained-only receipt lookup.
export type BackgroundRecovery = { version:1;key:string;topic:string;style:string;lang:string };
const storageKey=(userId:string,email:string,lang:string)=>'ytv:background-ai:pending:v1:'+JSON.stringify([userId,email,lang]);
function parse(value:string|null,lang:string):BackgroundRecovery|null {
  if(!value||value.length>4_000)return null;
  try {
    const v=JSON.parse(value);
    if(v?.version!==1||Object.keys(v).sort().join(',')!=='key,lang,style,topic,version'
      ||typeof v.key!=='string'||!/^bg-ai-[-A-Za-z0-9._:]{1,122}$/.test(v.key)
      ||typeof v.topic!=='string'||v.topic.trim()!==v.topic||v.topic.length<3||v.topic.length>500
      ||!['viral','cinematic','minimal','bold'].includes(v.style)||v.lang!==lang||!['es','en'].includes(lang))return null;
    return v;
  } catch {return null;}
}
export function readBackgroundRecovery(userId:string|undefined,email:string|null|undefined,status:string,lang:string) {
  if(status!=='authenticated'||!userId||!email)return null;
  try{return parse(sessionStorage.getItem(storageKey(userId,email,lang)),lang);}catch{return null;}
}
export function storeBackgroundRecovery(userId:string,email:string,record:BackgroundRecovery) {
  const value=JSON.stringify(record);if(!parse(value,record.lang))return false;
  try{const name=storageKey(userId,email,record.lang);sessionStorage.setItem(name,value);return sessionStorage.getItem(name)===value;}catch{return false;}
}
export function clearBackgroundRecovery(userId:string,email:string,lang:string,key:string) {
  try{const name=storageKey(userId,email,lang);if(parse(sessionStorage.getItem(name),lang)?.key===key)sessionStorage.removeItem(name);}catch{/* Memory recovery still works. */}
}
