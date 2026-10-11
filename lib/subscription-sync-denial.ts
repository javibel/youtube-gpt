type Owner = Readonly<{userId:string;email:string}>;
const denied=new Set<string>(),otherDenied=new Set<string>();
const key=(owner:Owner,prefix='dashboard-sync')=>'ytubviral:'+prefix+':'+JSON.stringify([owner.userId,owner.email]);
// Presence can only deny. No marker content, clock or copied receipt restores
// an original or allows another action; operational retirement is separate.
export function syncDenied(owner:Owner):boolean {
  if(denied.has(key(owner)))return true;
  try{return sessionStorage.getItem(key(owner))!==null;}catch{denied.add(key(owner));return true;}
}
export function otherBillingDenied(owner:Owner):boolean {
  if(otherDenied.has(key(owner)))return true;
  try{return ['profile-checkout','profile-cancellation','profile-downgrade'].some(p=>sessionStorage.getItem(key(owner,p))!==null);}catch{return true;}
}
export function denyOtherBilling(owner:Owner):void{otherDenied.add(key(owner));}
export function denySync(owner:Owner):boolean {
  if(syncDenied(owner)||otherBillingDenied(owner))return false;
  denied.add(key(owner));
  try{sessionStorage.setItem(key(owner),'pending');return true;}catch{return false;}
}
