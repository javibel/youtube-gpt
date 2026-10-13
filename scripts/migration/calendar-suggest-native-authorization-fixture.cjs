'use strict';
// Closed legacy business-test adapter only; it cannot establish native or
// operative permission. Production imports the private TypeScript module.
module.exports=function(auth){
 const originals=new WeakMap();
 return{
  async authorizeNativeCalendarSuggest(){if(typeof auth!=='function')throw Error('Explicit synthetic suggest auth required');const session=await auth(),user=session?.user;if(typeof user?.id!=='string'||!user.id||typeof user.email!=='string'||!user.email)return null;const cap=Object.freeze({});originals.set(cap,{owner:Object.freeze({id:user.id,email:user.email}),used:false});return cap;},
  async runNativeCalendarSuggest(original,action){const own=originals.get(original);if(!own||own.used)throw Error('Synthetic suggestion original required');own.used=true;return action(own.owner,()=>{});}
 };
};
