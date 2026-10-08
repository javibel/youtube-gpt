// Last pending selection in this tab, scoped to the authenticated account/language.
// Only request identity/input is retained. Never cache or trust results/authority here.
export type BulkRecovery = { version: 1; key: string; rawBody: string;
  input: { template: string; topics: string[]; options: Record<string,string>; lang: string } };
const storageKey = (userId:string,email:string,lang:string) => 'ytv:bulk:pending:v1:'+JSON.stringify([userId,email,lang]);
function parse(value:string|null,lang:string):BulkRecovery|null {
  if (!value || value.length>24_000) return null;
  try {
    const record=JSON.parse(value);
    if (record?.version!==1 || typeof record.key!=='string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(record.key)
      || typeof record.rawBody!=='string' || record.rawBody.length>20_000
      || Object.keys(record).sort().join(',')!=='key,rawBody,version') return null;
    const input=JSON.parse(record.rawBody);
    if (!input || typeof input.template!=='string' || !['title','description','caption','thumbnail','shorts_hook'].includes(input.template)
      || input.lang!==lang || !['es','en'].includes(lang) || !Array.isArray(input.topics) || input.topics.length<1 || input.topics.length>10
      || input.topics.some((v:unknown)=>typeof v!=='string'||!v.trim()||v.trim()!==v||v.length>500)
      || !input.options || Array.isArray(input.options) || typeof input.options!=='object'
      || Object.keys(input.options).length>20 || Object.keys(input.options).some(k=>k.length>80)
      || Object.values(input.options).some(v=>typeof v!=='string'||v.length>500)
      || Object.keys(input).sort().join(',')!=='lang,options,template,topics') return null;
    return {...record,input};
  } catch { return null; }
}
export function readBulkRecovery(userId:string|undefined,email:string|null|undefined,status:string,lang:string) {
  if (status!=='authenticated'||!userId||!email) return null;
  try { return parse(sessionStorage.getItem(storageKey(userId,email,lang)),lang); } catch { return null; }
}
export function storeBulkRecovery(userId:string,email:string,lang:string,key:string,rawBody:string) {
  const value=JSON.stringify({version:1,key,rawBody});if(!parse(value,lang))return false;
  try { const name=storageKey(userId,email,lang);sessionStorage.setItem(name,value);return sessionStorage.getItem(name)===value; } catch { return false; }
}
export function clearBulkRecovery(userId:string,email:string,lang:string,key:string) {
  try { const name=storageKey(userId,email,lang),current=parse(sessionStorage.getItem(name),lang);
    // A late acknowledgement must never erase a newer pending selection.
    if(current?.key===key)sessionStorage.removeItem(name);
  } catch { /* Memory recovery remains available if browser storage is unavailable. */ }
}
