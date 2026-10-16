'use client';
import { useEffect, useRef, useState } from 'react';
import { beginAdminSocialPreview, type SocialPreviewReceipt } from '@/lib/admin-social-preview-client';
type Session={user?:{id?:string;email?:string|null;isAdmin?:boolean;requiresTotp?:boolean;requiresVerification?:boolean};expires?:string}|null;
type Writer=ReturnType<typeof beginAdminSocialPreview>;
type Scope={key:string;mounted:boolean;writer:Writer|null;running:boolean;blocked:boolean;current:()=>boolean};
const unconfirmed='No se pudo confirmar el preview. No se ha reintentado.';
export function useAdminSocialPreview(session:Session,status:string,busy:{current:boolean}){
  const u=session?.user,id=u?.id,email=u?.email,expiresAt=Date.parse(session?.expires??'');
  const eligible=status==='authenticated'&&u?.isAdmin===true&&u.requiresTotp===false&&u.requiresVerification===false&&!!id&&!!email&&expiresAt>Date.now();
  const key=JSON.stringify([id,email,session?.expires,status,u?.isAdmin,u?.requiresTotp,u?.requiresVerification]);
  const live=useRef({key,eligible});live.current={key,eligible};const active=useRef<Scope|null>(null),lockOwner=useRef<Scope|null>(null);
  const [view,setView]=useState<{scope:Scope|null;writer:Writer|null;receipt:SocialPreviewReceipt|null;phase:'idle'|'pending'|'confirmed'|'unconfirmed'}>({scope:null,writer:null,receipt:null,phase:'idle'});
  useEffect(()=>{
    const scope:Scope={key,mounted:true,writer:null,running:false,blocked:false,current:()=>false};active.current=scope;
    scope.current=()=>scope.mounted&&active.current===scope&&live.current.key===key&&live.current.eligible&&document.visibilityState==='visible'&&document.hasFocus();
    // Mounting enables a click; it never starts business work by itself.
    setView({scope,writer:null,receipt:null,phase:'idle'});
    const hide=()=>scope.writer?.retire(),visibility=()=>{if(document.visibilityState==='hidden')hide();};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',hide);window.addEventListener('pagehide',hide);
    return()=>{scope.mounted=false;scope.writer?.retire();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',hide);window.removeEventListener('pagehide',hide);};
  },[key]);
  const scope=active.current,visible=scope?.key===key&&scope.mounted&&eligible?scope:null;
  const start=()=>{
    if(!visible?.current()||visible.running||visible.blocked||busy.current)return;
    visible.writer?.retire();visible.running=true;busy.current=true;lockOwner.current=visible;
    const unlock=()=>{if(lockOwner.current===visible){lockOwner.current=null;busy.current=false;}};
    let writer:Writer;
    writer=beginAdminSocialPreview({id:id!,email:email!,expiresAt},'morning',()=>visible.current()&&(!writer||visible.writer===writer),()=>{void Promise.resolve().then(()=>{
      if(visible.writer!==writer)return;
      if(visible.running)visible.blocked=true;
      visible.running=false;unlock();
      if(visible.current())setView({scope:visible,writer,receipt:null,phase:visible.blocked?'unconfirmed':'idle'});
    });});
    visible.writer=writer;setView({scope:visible,writer,receipt:null,phase:'pending'});
    void writer.original.then(receipt=>{
      if(!visible.current()||visible.writer!==writer||!writer.display(receipt))return;
      visible.running=false;unlock();setView({scope:visible,writer,receipt,phase:'confirmed'});
    }).catch(()=>{writer.retire();}).finally(()=>{if(visible.writer===writer&&visible.running){visible.running=false;unlock();}});
  };
  const shown=visible&&view.scope===visible&&visible.current()?view:null;
  const data=shown?.phase==='confirmed'?shown.writer?.display(shown.receipt)??null:null;
  return{start,close:()=>{if(visible?.current())visible.writer?.retire();},data,running:shown?.phase==='pending',canStart:!!visible&&visible.current()&&!visible.running&&!visible.blocked&&!busy.current,message:shown?.phase==='pending'?'Generando preview…':shown?.phase==='unconfirmed'?unconfirmed:''};
}
