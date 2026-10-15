'use strict';
// Declared legacy actors for closed business tests only. Real permissions use
// the installed native cookie or current extension credential readers instead.
module.exports=(auth,extension)=>{
 const originals=new WeakMap();
 return{
  async authorizeNativeCoach(request){
   if(!request.headers.get('cookie'))return null;
   const session=await auth?.(),actor=session?.user,source='web';
   if(typeof actor?.id!=='string'||typeof actor.email!=='string')return null;
   const cap=Object.freeze({});originals.set(cap,{owner:Object.freeze({id:actor.id,email:actor.email,source}),used:false});return cap;
  },
  async runNativeCoach(cap,action){const own=originals.get(cap);if(!own||own.used)throw Error('Synthetic Coach original unavailable');own.used=true;return action(own.owner,()=>{});}
 };
};
