'use client';
import { useEffect, useRef, useState } from 'react';
import { beginAdminSocialPublication, type SocialPublicationReceipt } from '@/lib/admin-social-publication-client';

type Session={user?:{id?:string;email?:string|null;authSessionRef?:string;isAdmin?:boolean;requiresTotp?:boolean;requiresVerification?:boolean};expires?:string}|null;
type Writer=ReturnType<typeof beginAdminSocialPublication>;
type Scope={key:string;mounted:boolean;writer:Writer|null;running:boolean;attempted:boolean;current:()=>boolean};
const unconfirmed='No se pudo confirmar la publicación. Revisa el historial; puede haberse completado parcialmente.';
export function useAdminSocialPublication(session:Session,status:string,busy:{current:boolean}){
  const u=session?.user,id=u?.id,email=u?.email,authSessionRef=u?.authSessionRef,expiresAt=Date.parse(session?.expires??'');
  const eligible=status==='authenticated'&&u?.isAdmin===true&&u.requiresTotp===false&&u.requiresVerification===false&&!!id&&!!email&&typeof authSessionRef==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(authSessionRef)&&expiresAt>Date.now();
  const key=JSON.stringify([id,email,authSessionRef,session?.expires,status,u?.isAdmin,u?.requiresTotp,u?.requiresVerification]);
  const live=useRef({key,eligible});live.current={key,eligible};const active=useRef<Scope|null>(null),lockOwner=useRef<Scope|null>(null);
  const [view,setView]=useState<{scope:Scope|null;writer:Writer|null;receipt:SocialPublicationReceipt|null;phase:'idle'|'pending'|'confirmed'|'unconfirmed'}>({scope:null,writer:null,receipt:null,phase:'idle'});
  useEffect(()=>{
    const scope:Scope={key,mounted:true,writer:null,running:false,attempted:false,current:()=>false};active.current=scope;
    scope.current=()=>scope.mounted&&active.current===scope&&live.current.key===key&&live.current.eligible&&document.visibilityState==='visible'&&document.hasFocus();
    setView({scope,writer:null,receipt:null,phase:'idle'});
    const hide=()=>scope.writer?.retire(),visibility=()=>{if(document.visibilityState==='hidden')hide();};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',hide);window.addEventListener('pagehide',hide);
    return()=>{scope.mounted=false;scope.writer?.retire();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',hide);window.removeEventListener('pagehide',hide);};
  },[key]);
  const scope=active.current,visible=scope?.key===key&&scope.mounted&&eligible?scope:null;
  const start=(type:'morning'|'evening')=>{
    if(!visible?.current()||visible.running||visible.attempted||busy.current)return;
    visible.attempted=true;visible.running=true;busy.current=true;lockOwner.current=visible;
    const unlock=()=>{if(lockOwner.current===visible){lockOwner.current=null;busy.current=false;}};
    let writer:Writer;
    writer=beginAdminSocialPublication({id:id!,email:email!,authSessionRef:authSessionRef!,expiresAt},type,()=>visible.current()&&(!writer||visible.writer===writer),()=>{void Promise.resolve().then(()=>{
      if(visible.writer!==writer)return;
      const uncertain=visible.running;visible.running=false;unlock();
      if(visible.mounted&&active.current===visible&&live.current.key===visible.key)setView({scope:visible,writer,receipt:null,phase:uncertain?'unconfirmed':'idle'});
    });});
    visible.writer=writer;setView({scope:visible,writer,receipt:null,phase:'pending'});
    void writer.original.then(receipt=>{
      if(!visible.current()||visible.writer!==writer||!writer.display(receipt))return;
      visible.running=false;unlock();setView({scope:visible,writer,receipt,phase:'confirmed'});
    }).catch(()=>{writer.retire();}).finally(()=>{if(visible.writer===writer&&visible.running){visible.running=false;unlock();}});
  };
  const shown=visible&&view.scope===visible&&visible.current()?view:null;
  const data=shown?.phase==='confirmed'?shown.writer?.display(shown.receipt)??null:null;
  return{start,data,running:shown?.phase==='pending',canStart:!!visible&&visible.current()&&!visible.running&&!visible.attempted&&!busy.current,message:data?'Publicación confirmada en Facebook e Instagram.':shown?.phase==='pending'?'Publicando en Facebook e Instagram…':shown?.phase==='unconfirmed'?unconfirmed:''};
}
