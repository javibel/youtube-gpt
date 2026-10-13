'use strict';
// Closed legacy business fixtures only; not native/operative authentication.
module.exports=auth=>{
 const originals=new WeakMap(),purposes=new Set(['read','create','rename','exit','invite','revoke','member-role','member-remove','join']);
 const retained=(original,purpose)=>{const own=original&&typeof original==='object'?originals.get(original):undefined;if(!own||own.purpose!==purpose)throw Error('Synthetic team permission unavailable');return own;};
 return{
  async authorizeNativeTeam(purpose){
   if(!purposes.has(purpose)||typeof auth!=='function')throw Error('Team purpose/auth must be explicitly bound');
   const session=await auth(),user=session?.user;if(!user?.id||purpose!=='read'&&typeof user.email!=='string')return null;
   const original=Object.freeze({});originals.set(original,{purpose,owner:Object.freeze({userId:user.id,email:user.email??null}),used:false});return original;
  },
  async runNativeTeam(original,purpose,action){const own=retained(original,purpose);if(own.used)throw Error('Synthetic team permission consumed');own.used=true;const result=await action(own.owner,()=>{retained(original,purpose);});retained(original,purpose);return result;}
 };
};
