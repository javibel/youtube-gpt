// Negative continuity only. A persisted marker never recovers an original.
const pending=new Map<string,object>(),denied=new Set<string>();
const key=(id:string)=>'ytubviral:ab-native-create:'+JSON.stringify([id]);
export function abCreationClientBlocked(id:string):boolean{try{if(!pending.has(id)&&sessionStorage.getItem(key(id))!==null)denied.add(id);return pending.has(id)||denied.has(id);}catch{return true;}}
export function denyAbCreationClient(id:string){denied.add(id);}
export function retainAbCreationClient(id:string){
 if(abCreationClientBlocked(id))throw Error('ab_creation_unconfirmed');const own={};pending.set(id,own);
 try{sessionStorage.setItem(key(id),'pending');}catch{denied.add(id);throw Error('ab_creation_unconfirmed');}
 return Object.freeze({deny(){denied.add(id);},complete(){if(pending.get(id)!==own||denied.has(id))throw Error('ab_creation_unconfirmed');try{sessionStorage.removeItem(key(id));pending.delete(id);}catch{denied.add(id);}}});
}
