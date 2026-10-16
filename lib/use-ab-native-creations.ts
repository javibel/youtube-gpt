'use client';
import { useEffect,useMemo,useRef,useState } from 'react';
import { beginAbNativeCreation,abNativeCreationsBlocked,type AbNativeCreationReceipt } from '@/lib/ab-create-native-client';
import type { AbVideo } from '@/lib/use-ab-test-read';
type Selection={video:AbVideo;lang:'es'|'en';token:object;variantA:string;variantB:string;hours:number};
type Reader=ReturnType<typeof beginAbNativeCreation>;
export function useAbNativeCreations(id:string,email:string,lang:'es'|'en',native:{sessionRef:string;expiresAt:number;eligible:boolean},currentView:()=>boolean){
 const key=JSON.stringify([id,email,lang,native.sessionRef,native.expiresAt,native.eligible]);
 const scope=useMemo(()=>({key,mounted:true,reader:null as Reader|null,running:false}),[key]);
 const active=useRef(scope);active.current=scope;
 const view=useRef(currentView);view.current=currentView;
 const [state,setState]=useState<{scope:typeof scope;status:'idle'|'sending'|'confirmed'|'unconfirmed'|'invalid';reader:Reader|null;receipt:AbNativeCreationReceipt|null;selection:Selection|null}>({scope,status:'idle',reader:null,receipt:null,selection:null});
 const current=()=>active.current===scope&&scope.mounted&&native.eligible&&Date.now()<native.expiresAt&&view.current()&&document.visibilityState==='visible'&&document.hasFocus();
 useEffect(()=>{scope.mounted=true;const hide=()=>scope.reader?.retire(),visibility=()=>{if(document.visibilityState==='hidden')hide();};
   document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',hide);window.addEventListener('pagehide',hide);
   return()=>{scope.mounted=false;scope.reader?.retire();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',hide);window.removeEventListener('pagehide',hide);};
 },[scope]);
 const start=(input:Selection,selectedCurrent:()=>boolean)=>{
   if(!current()||scope.running||abNativeCreationsBlocked(id,email))return null;
   const selected={...input,video:{...input.video}};scope.running=true;scope.reader?.retire();
   let reader:Reader;
   try{reader=beginAbNativeCreation({id,email,sessionRef:native.sessionRef,expiresAt:native.expiresAt},{originalTitle:selected.video.title,lang:selected.lang,videoId:selected.video.videoId,channelId:selected.video.channelId,variantA:selected.variantA,variantB:selected.variantB,hoursPerVariant:selected.hours},()=>current()&&selectedCurrent()&&(!reader||scope.reader===reader),()=>{void Promise.resolve().then(()=>{if(active.current===scope&&scope.mounted&&scope.reader===reader)setState(s=>s.scope===scope&&s.status==='confirmed'?{...s,status:'idle',receipt:null}:{scope,status:'unconfirmed',reader,receipt:null,selection:selected});});});}
   catch{scope.running=false;setState({scope,status:'invalid',reader:null,receipt:null,selection:selected});return null;}
   scope.reader=reader;setState({scope,status:'sending',reader,receipt:null,selection:selected});
   return reader.original.then(receipt=>{if(current()&&scope.reader===reader&&reader.read(receipt))setState({scope,status:'confirmed',reader,receipt,selection:selected});}).catch(()=>{if(active.current===scope&&scope.mounted&&scope.reader===reader)setState({scope,status:'unconfirmed',reader,receipt:null,selection:selected});}).finally(()=>{if(scope.reader===reader)scope.running=false;});
 };
 const shown=active.current===scope&&state.scope===scope&&current()?state:null;
 // This read can only veto a retired view;it cannot originate work or a receipt.
 if(shown?.status==='sending')shown.reader?.read(null);
 const data=shown?.status==='confirmed'?shown.reader?.read(shown.receipt)??null:null;
 const denied=abNativeCreationsBlocked(id,email);
 return{status:(!shown||shown.status==='idle')&&denied?'unconfirmed' as const:shown?.status??'idle',selection:shown?.selection??null,received:data?.test??null,blocked:scope.running||denied,start};
}
