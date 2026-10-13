'use strict';
// Explicit legacy synthetic authorization adapter for existing business/PG
// contract fixtures. It is never evidence of native authentication.
module.exports=auth=>{
 if(typeof auth!=='function')throw Error('Synthetic stats auth must be explicitly supplied');
 const originals=new WeakMap();
 return{
  async authorizeNativeStats(){const session=await auth(),user=session?.user;
   if(typeof user?.id!=='string'||!user.id||typeof user.email!=='string'||!user.email)return null;
   const original=Object.freeze({});originals.set(original,{owner:Object.freeze({id:user.id,email:user.email}),used:false});return original;
  },
  async runNativeStats(original,read){const own=original&&typeof original==='object'?originals.get(original):undefined;
   if(!own||own.used)throw Error('Synthetic stats original missing');own.used=true;return read(own.owner,()=>{if(!originals.has(original))throw Error('Synthetic stats original missing');});
  }
 };
};
