// Untrusted same-tab input continuity only. The server must confirm its own
// retained result; this record never authorizes admission or model execution.
export type GenericRecovery={version:1;key:string;body:string;action:'generate'|'continue';base:string};
const slot=(user:string,email:string,lang:string)=>'ytv:text:pending:v1:'+JSON.stringify([user,email,lang]);
function parse(value:string|null,lang:string):GenericRecovery|null {
  if(!value||value.length>200_000||!['es','en'].includes(lang))return null;
  try{
    const r=JSON.parse(value);
    if(r?.version!==1||Object.keys(r).sort().join(',')!=='action,base,body,key,version'
      ||typeof r.key!=='string'||!/^[-A-Za-z0-9._:]{1,128}$/.test(r.key)
      ||!['generate','continue'].includes(r.action)||typeof r.base!=='string'||r.base.length>32_000
      ||typeof r.body!=='string')return null;
    const b=JSON.parse(r.body);
    if(!b||Object.keys(b).sort().join(',')!=='inputs,lang,template'||b.lang!==lang
      ||typeof b.template!=='string'||!/^[a-z][a-z0-9_]{0,63}$/.test(b.template)
      ||['thumbnail','video_preview'].includes(b.template)||!b.inputs||Array.isArray(b.inputs)||typeof b.inputs!=='object'
      ||Object.keys(b.inputs).length>32||Object.entries(b.inputs).some(([k,v])=>k.length>128||typeof v!=='string'
        ||v.length>(k==='_previousContent'?32_000:500)))return null;
    if(r.action==='generate'?(r.base!==''||Object.hasOwn(b.inputs,'_previousContent'))
      :(!r.base||b.inputs._previousContent!==r.base))return null;
    return r;
  }catch{return null;}
}
export function recoveryForm(record:GenericRecovery){
  const body=JSON.parse(record.body);const inputs:Record<string,string>={...body.inputs};delete inputs._previousContent;
  return {template:body.template as string,inputs};
}
export function readGenericRecovery(user:string|undefined,email:string|null|undefined,status:string,lang:string){
  if(status!=='authenticated'||!user||!email)return null;
  try{return parse(sessionStorage.getItem(slot(user,email,lang)),lang);}catch{return null;}
}
export function storeGenericRecovery(user:string,email:string,lang:string,record:GenericRecovery){
  try{const value=JSON.stringify(record);if(!parse(value,lang))return false;const name=slot(user,email,lang);
    sessionStorage.setItem(name,value);return sessionStorage.getItem(name)===value;
  }catch{return false;}
}
export function clearGenericRecovery(user:string,email:string,lang:string,key:string){
  try{const name=slot(user,email,lang);if(parse(sessionStorage.getItem(name),lang)?.key===key)sessionStorage.removeItem(name);}catch{/* Memory recovery remains available. */}
}
