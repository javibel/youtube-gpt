'use strict';
// Declared legacy actors for closed business tests only. Real permissions use
// the installed native cookie or current extension credential readers instead.
module.exports=(auth,extension)=>{
 const originals=new WeakMap();
 return{
  async authorizeNativeCoach(request){
   const session=await auth?.();let actor=session?.user,source='web',isPro;
   if(!actor?.id){const ext=await extension?.(request);actor=ext?.user;source='extension';isPro=ext?.isPro;}
   if(typeof actor?.id!=='string'||typeof actor.email!=='string')return null;
   const cap=Object.freeze({});originals.set(cap,{owner:Object.freeze({id:actor.id,email:actor.email,source,...(source==='extension'?{isPro}: {})}),used:false});return cap;
  },
  async runNativeCoach(cap,action){const own=originals.get(cap);if(!own||own.used)throw Error('Synthetic Coach original unavailable');own.used=true;return action(own.owner,()=>{});}
 };
};
