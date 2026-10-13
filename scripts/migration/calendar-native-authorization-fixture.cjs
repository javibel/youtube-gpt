'use strict';
// Closed legacy business-test adapter only. It does not establish native or
// operative authentication. Production imports the TypeScript native module.
module.exports=function(auth){
 const originals=new WeakMap(),purposes=new Set(['read','create','update','delete']);
 return{
  async authorizeNativeCalendar(purpose){if(!purposes.has(purpose)||typeof auth!=='function')throw Error('Explicit synthetic calendar auth required');const session=await auth(),user=session?.user;if(typeof user?.id!=='string'||!user.id||typeof user.email!=='string'||!user.email)return null;const cap=Object.freeze({});originals.set(cap,{owner:Object.freeze({id:user.id,email:user.email}),purpose,used:false});return cap;},
  async runNativeCalendar(original,purpose,action){const own=originals.get(original);if(!own||own.purpose!==purpose||own.used)throw Error('Synthetic calendar original required');own.used=true;return action(own.owner,()=>{});}
 };
};
