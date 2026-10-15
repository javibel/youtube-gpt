'use client';
import {useEffect,useRef,useState} from 'react';
import {beginAdminUserDeletion,type AdminUserDeletionTarget,type AdminUserDeletionReceipt} from '@/lib/admin-user-deletion-client';
import type {AdminData} from '@/lib/admin-stats-client';
type Writer=ReturnType<typeof beginAdminUserDeletion>;
type Session={user?:{id?:string;email?:string|null;isAdmin?:boolean;requiresTotp?:boolean;requiresVerification?:boolean};expires?:string}|null;
type Scope={key:string;data:AdminData|null;mounted:boolean;writer:Writer|null;selected:AdminUserDeletionTarget|null;running:boolean;current:()=>boolean};
export function useAdminUserDeletion(session:Session,status:string,data:AdminData|null,refresh:()=>void){
 const user=session?.user,id=user?.id,email=user?.email,expiresAt=Date.parse(session?.expires??'');
 const eligible=status==='authenticated'&&user?.isAdmin===true&&user.requiresTotp===false&&user.requiresVerification===false&&!!id&&!!email&&expiresAt>Date.now()&&!!data;
 const key=JSON.stringify([id,email,session?.expires,status,user?.isAdmin,user?.requiresTotp,user?.requiresVerification]);
 const live=useRef({key,eligible,data});live.current={key,eligible,data};
 const active=useRef<Scope|null>(null),attempts=useRef(new Set<string>());
 const [view,setView]=useState<{scope:Scope|null;writer:Writer|null;receipt:AdminUserDeletionReceipt|null;phase:'idle'|'chosen'|'pending'|'unconfirmed'|'confirmed'}>({scope:null,writer:null,receipt:null,phase:'idle'});
 useEffect(()=>{
  const scope:Scope={key,data,mounted:true,writer:null,selected:null,running:false,current:()=>false};active.current=scope;
  scope.current=()=>scope.mounted&&active.current===scope&&live.current.key===key&&live.current.data===data&&live.current.eligible&&document.visibilityState==='visible'&&document.hasFocus();
  const hide=()=>{scope.selected=null;scope.writer?.retire();if(scope.current())setView({scope,writer:scope.writer,receipt:null,phase:scope.writer?'unconfirmed':'idle'});};
  const visibility=()=>{if(document.visibilityState==='hidden')hide();};document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',hide);window.addEventListener('pagehide',hide);
  return()=>{scope.mounted=false;scope.selected=null;scope.writer?.retire();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',hide);window.removeEventListener('pagehide',hide);};
 },[key,data]);
 const scope=active.current,visible=scope?.key===key&&scope.data===data&&scope.mounted&&eligible?scope:null;
 const canChoose=(targetId:string)=>!!visible&&visible.current()&&!visible.running&&attempts.current.size<10000&&!attempts.current.has(targetId)&&!!data?.recentUsers.some(r=>r.id===targetId&&r.id!==id&&r.email!==email&&r.plan==='free'&&!r.isPro&&r.generationCount===0);
 const choose=(targetId:string)=>{if(!canChoose(targetId)||!visible)return;const row=data!.recentUsers.find(r=>r.id===targetId)!;visible.selected=Object.freeze({userId:row.id,email:row.email});setView({scope:visible,writer:null,receipt:null,phase:'chosen'});};
 const cancel=()=>{if(!visible?.current())return;visible.selected=null;visible.writer?.retire();setView({scope:visible,writer:null,receipt:null,phase:'idle'});};
 const selected=visible?.current()?visible.selected:null;
 const confirm=(targetId:string)=>{
  if(!canChoose(targetId)||!visible||!selected||visible.selected!==selected||selected.userId!==targetId||view.scope!==visible||view.phase!=='chosen')return;
  // Capture the selected identity and this exact reader before any asynchronous
  // work. A stale handler cannot confirm a later selection or reader generation.
  const selection=selected,capturedRefresh=refresh;attempts.current.add(targetId);visible.running=true;
  let writer:Writer;
  writer=beginAdminUserDeletion({id:id!,email:email!,expiresAt},selection,()=>visible.current()&&visible.selected===selection&&(!writer||visible.writer===writer),()=>{void Promise.resolve().then(()=>{if(visible.current()&&visible.writer===writer)setView({scope:visible,writer,receipt:null,phase:'unconfirmed'});});});
  visible.writer=writer;setView({scope:visible,writer,receipt:null,phase:'pending'});
  void writer.original.then(receipt=>{if(!visible.current()||visible.writer!==writer||!writer.confirmed(receipt))return;visible.running=false;setView({scope:visible,writer,receipt,phase:'confirmed'});if(writer.confirmed(receipt))capturedRefresh();}).catch(()=>{writer.retire();if(visible.writer===writer){visible.running=false;if(visible.current())setView({scope:visible,writer,receipt:null,phase:'unconfirmed'});}}).finally(()=>{if(visible.writer===writer)visible.running=false;});
 };
 const shown=visible&&view.scope===visible&&visible.current()?view:null;
 return{choose,canChoose,cancel,confirm,confirmId:shown?.phase==='chosen'?selected?.userId??null:null,pendingId:shown?.phase==='pending'?selected?.userId??null:null,message:shown?.phase==='pending'?'Esperando confirmación de eliminación…':shown?.phase==='unconfirmed'?'No se pudo confirmar la eliminación. No se ha reintentado.':shown?.phase==='confirmed'&&shown.writer?.confirmed(shown.receipt)?'Cuenta vacía eliminada.':''};
}
