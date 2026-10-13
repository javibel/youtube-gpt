'use strict';
// Explicit closed business-test adapter only. Its declared fixture actor is not
// native/operative authority; production uses the TypeScript native module.
module.exports=function(auth){
 const originals=new WeakMap(),purposes=new Set(['read','send']);
 return{
  async authorizeNativeChat(purpose){if(!purposes.has(purpose)||typeof auth!=='function')throw Error('Explicit synthetic chat auth required');const session=await auth(),user=session?.user;if(typeof user?.id!=='string'||!user.id||typeof user.email!=='string'||!user.email)return null;const cap=Object.freeze({});originals.set(cap,{owner:Object.freeze({id:user.id,email:user.email}),purpose,used:false});return cap;},
  async runNativeChat(original,purpose,action){const own=originals.get(original);if(!own||own.purpose!==purpose||own.used)throw Error('Synthetic chat original required');own.used=true;return action(own.owner,()=>{});}
 };
};
