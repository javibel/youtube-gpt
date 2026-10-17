'use client';
import {useEffect,useRef,useState} from 'react';
import {adminSocialStateBlocked,beginAdminSocialState,type SocialStateOwner,type SocialStateView} from '@/lib/admin-social-state-client';
type Session={user?:{id?:string;email?:string|null;authSessionRef?:string;isAdmin?:boolean;requiresTotp?:boolean;requiresVerification?:boolean};expires?:string}|null;
type Reader=ReturnType<typeof beginAdminSocialState>;
type Scope={key:string;mounted:boolean;closed:boolean;reading:boolean;reader:Reader|null;current:()=>boolean};
export function useAdminSocialState(session:Session,status:string){
  const u=session?.user,expiresAt=Date.parse(session?.expires??'');
  const eligible=status==='authenticated'&&u?.isAdmin===true&&u.requiresTotp===false&&u.requiresVerification===false&&!!u.id&&!!u.email&&!!u.authSessionRef&&expiresAt>Date.now();
  const key=JSON.stringify([u?.id,u?.email,u?.authSessionRef,session?.expires,status,u?.isAdmin,u?.requiresTotp,u?.requiresVerification]);
  const live=useRef({key,eligible});live.current={key,eligible};
  const active=useRef<Scope|null>(null),[view,setView]=useState<{scope:Scope|null;read?:SocialStateView;pending:boolean}>({scope:null,pending:false});
  useEffect(()=>{
    const scope:Scope={key,mounted:true,closed:false,reading:false,reader:null,current:()=>false};active.current=scope;
    scope.current=()=>scope.mounted&&!scope.closed&&active.current===scope&&live.current.key===key&&live.current.eligible&&document.visibilityState==='visible'&&document.hasFocus();
    const owner:SocialStateOwner={id:u?.id??'',email:u?.email??'',authSessionRef:u?.authSessionRef??'',expiresAt};
    const poll=()=>{
      if(!scope.current()||scope.reading||adminSocialStateBlocked(owner))return;
      scope.reader?.retire();scope.reading=true;
      let reader:Reader;
      reader=beginAdminSocialState(owner,()=>scope.current()&&(!reader||scope.reader===reader),()=>{void Promise.resolve().then(()=>{
        if(scope.reader!==reader)return;scope.reading=false;
        if(scope.mounted&&active.current===scope)setView({scope,pending:false});
      });});scope.reader=reader;setView({scope,pending:true});
      void reader.original.then(read=>{
        if(scope.reader===reader&&scope.current()&&reader.display(read))setView({scope,read,pending:false});else reader.retire();
      }).catch(()=>reader.retire()).finally(()=>{if(scope.reader===reader)scope.reading=false;});
    };
    const hide=()=>scope.reader?.retire(),pagehide=()=>{scope.closed=true;hide();setView({scope,pending:false});},visibility=()=>{if(document.visibilityState==='hidden')hide();};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',hide);window.addEventListener('pagehide',pagehide);
    setView({scope,pending:false});poll();const timer=setInterval(poll,30000);
    return()=>{scope.mounted=false;scope.reader?.retire();clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',hide);window.removeEventListener('pagehide',pagehide);};
  },[key]);
  const scope=active.current,shown=scope?.key===key&&scope.mounted&&eligible&&view.scope===scope?view:null;
  const data=shown?.read?scope?.reader?.display(shown.read)??null:null;
  return{data,pending:!!shown?.pending,message:data?'Historial almacenado (hasta 20 registros por lista). Configuración declarada; conexión de proveedores sin comprobar.':shown?.pending?'Cargando estado e historial…':'Estado e historial no disponibles.'};
}
