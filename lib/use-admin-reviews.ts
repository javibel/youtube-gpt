'use client';
import { useEffect, useRef, useState } from 'react';
import { beginAdminReviewsRead, type AdminReviewsDisplay } from '@/lib/admin-reviews-client';
type Reader=ReturnType<typeof beginAdminReviewsRead>;
type Session={user?:{id?:string;email?:string|null;isAdmin?:boolean;requiresTotp?:boolean;requiresVerification?:boolean};expires?:string}|null;
const message='Las reseñas no están confirmadas. Vuelve a consultarlas.';
export function useAdminReviews(session:Session,status:string) {
  const user=session?.user,id=user?.id,email=user?.email,expiresAt=Date.parse(session?.expires??'');
  const eligible=status==='authenticated'&&user?.isAdmin===true&&user.requiresTotp===false&&user.requiresVerification===false&&!!id&&!!email&&expiresAt>Date.now();
  const key=JSON.stringify([id,email,session?.expires,status,user?.isAdmin,user?.requiresTotp,user?.requiresVerification]);
  const live=useRef({key,eligible});live.current={key,eligible};
  const active=useRef<{key:string;mounted:boolean;reader:Reader|null}|null>(null);
  const [view,setView]=useState<{reader:Reader|null;result:AdminReviewsDisplay|null;loading:boolean;error:string}>({reader:null,result:null,loading:true,error:''});
  useEffect(()=>{
    const scope={key,mounted:true,reader:null as Reader|null};active.current=scope;
    const current=()=>scope.mounted&&active.current===scope&&live.current.key===key&&live.current.eligible&&document.visibilityState==='visible'&&document.hasFocus();
    const consult=()=>{
      if(!current())return;
      scope.reader?.retire();
      let reader:Reader;
      reader=beginAdminReviewsRead({id:id!,email:email!,expiresAt},current,()=>{void Promise.resolve().then(()=>{if(current()&&scope.reader===reader)setView({reader,result:null,loading:false,error:message});});});
      scope.reader=reader;setView({reader,result:null,loading:true,error:''});
      void reader.original.then(result=>{if(current()&&scope.reader===reader&&reader.display(result))setView({reader,result,loading:false,error:''});},()=>{if(current()&&scope.reader===reader)setView({reader,result:null,loading:false,error:message});});
    };
    const hide=()=>{scope.reader?.retire();if(scope.mounted&&active.current===scope)setView({reader:null,result:null,loading:false,error:message});};
    const visibility=()=>{if(document.visibilityState==='hidden')hide();};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',hide);window.addEventListener('pagehide',hide);
    // The captured callback remains tied to this exact view/session generation.
    actions.current={scope,consult};if(eligible)consult();else setView({reader:null,result:null,loading:false,error:message});
    return()=>{scope.mounted=false;scope.reader?.retire();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',hide);window.removeEventListener('pagehide',hide);};
  },[key]); // eslint-disable-line react-hooks/exhaustive-deps
  const actions=useRef<{scope:NonNullable<typeof active.current>;consult:()=>void}|null>(null);
  const scope=active.current,read=scope?.key===key&&scope.mounted&&eligible&&view.reader===scope.reader?scope.reader:null;
  const data=read?.display(view.result)??null;
  const refresh=()=>{if(live.current.key===key&&live.current.eligible&&scope?.key===key&&active.current===scope&&actions.current?.scope===scope)actions.current.consult();};
  return{data,refresh,loading:eligible&&!data&&(view.loading||scope?.key!==key),error:eligible&&!data&&!view.loading?view.error||message:!eligible?message:''};
}
