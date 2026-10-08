// Same-tab pending capture continuity only. Local pixels/key are untrusted
// input for retained-only server lookup, never permission to create a save.
export type SaveRecovery = { version:1;key:string;meta:string;dataUrl:string };
const name=(userId:string,email:string,lang:string)=>'ytv:thumbnail-save:pending:v1:'+JSON.stringify([userId,email,lang]);
const maximum=2_800_000;
function parse(value:string|null):SaveRecovery|null {
  if(!value||value.length>maximum)return null;
  try {
    const v=JSON.parse(value);
    if(v?.version!==1||Object.keys(v).sort().join(',')!=='dataUrl,key,meta,version'
      ||typeof v.key!=='string'||!/^[-A-Za-z0-9._:]{1,128}$/.test(v.key)
      ||typeof v.dataUrl!=='string'||!/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.test(v.dataUrl)
      ||typeof v.meta!=='string'||v.meta.length>4096)return null;
    const m=JSON.parse(v.meta);
    if(!m||Array.isArray(m)||typeof m.topic!=='string'||m.topic.length>500||typeof m.hasPhoto!=='boolean'
      ||!Number.isSafeInteger(m.textCount)||m.textCount<0||m.textCount>1000
      ||Object.keys(m).some(k=>!['topic','hasPhoto','textCount','backgroundOperationKey'].includes(k))
      ||(Object.hasOwn(m,'backgroundOperationKey')&&(typeof m.backgroundOperationKey!=='string'
        ||!/^[-A-Za-z0-9._:]{1,128}$/.test(m.backgroundOperationKey))))return null;
    return v;
  }catch{return null;}
}
export function readSaveRecovery(userId:string|undefined,email:string|null|undefined,status:string,lang:string) {
  if(status!=='authenticated'||!userId||!email||!['es','en'].includes(lang))return null;
  try{return parse(sessionStorage.getItem(name(userId,email,lang)));}catch{return null;}
}
export function storeSaveRecovery(userId:string,email:string,lang:string,record:SaveRecovery) {
  try{const value=JSON.stringify(record);if(!['es','en'].includes(lang)||!parse(value))return false;
    const key=name(userId,email,lang);sessionStorage.setItem(key,value);return sessionStorage.getItem(key)===value;
  }catch{return false;}
}
export function clearSaveRecovery(userId:string,email:string,lang:string,key:string) {
  try{const slot=name(userId,email,lang);if(parse(sessionStorage.getItem(slot))?.key===key)sessionStorage.removeItem(slot);}catch{/* Original in-memory capture remains usable. */}
}
