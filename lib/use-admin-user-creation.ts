'use client';
import { useEffect, useRef, useState } from 'react';
import { beginAdminUserCreation, adminUserCreationCandidate, type AdminUserCreationForm, type AdminUserCreationReceipt } from '@/lib/admin-user-creation-client';
import type { AdminData } from '@/lib/admin-stats-client';

type Writer=ReturnType<typeof beginAdminUserCreation>;
type Session={user?:{id?:string;email?:string|null;isAdmin?:boolean;requiresTotp?:boolean;requiresVerification?:boolean};expires?:string}|null;
type Scope={key:string;mounted:boolean;writer:Writer|null;confirmedWriter:Writer|null;running:boolean;capturedView:AdminData|null;current:()=>boolean};
type Form={key:string;version:number;fields:AdminUserCreationForm};
const blank=():AdminUserCreationForm=>({email:'',name:'',password:''});
const unconfirmed='No se pudo confirmar la creación. No se ha reintentado.';
export function useAdminUserCreation(session:Session,status:string,statsView:AdminData|null,refreshStats:()=>void){
  const user=session?.user,id=user?.id,email=user?.email,expiresAt=Date.parse(session?.expires??'');
  const eligible=status==='authenticated'&&user?.isAdmin===true&&user.requiresTotp===false&&user.requiresVerification===false&&!!id&&!!email&&expiresAt>Date.now();
  const key=JSON.stringify([id,email,session?.expires,status,user?.isAdmin,user?.requiresTotp,user?.requiresVerification]);
  const [form,setForm]=useState<Form>({key,version:0,fields:blank()}),formRef=useRef(form),serial=useRef(0);formRef.current=form;
  const live=useRef({key,eligible,statsView});live.current={key,eligible,statsView};
  const active=useRef<Scope|null>(null),attempts=useRef(new Set<string>());
  const [view,setView]=useState<{scope:Scope|null;writer:Writer|null;receipt:AdminUserCreationReceipt|null;phase:'idle'|'pending'|'unconfirmed'|'confirmed'}>({scope:null,writer:null,receipt:null,phase:'idle'});
  useEffect(()=>{
    const scope:Scope={key,mounted:true,writer:null,confirmedWriter:null,running:false,capturedView:null,current:()=>false};active.current=scope;
    scope.current=()=>scope.mounted&&active.current===scope&&live.current.key===key&&live.current.eligible&&document.visibilityState==='visible'&&document.hasFocus();
    if(formRef.current.key!==key){const next={key,version:++serial.current,fields:blank()};formRef.current=next;setForm(next);}
    const hide=()=>scope.writer?.retire(),visibility=()=>{if(document.visibilityState==='hidden')hide();};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',hide);window.addEventListener('pagehide',hide);
    return()=>{scope.mounted=false;scope.writer?.retire();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',hide);window.removeEventListener('pagehide',hide);};
  },[key]);
  useEffect(()=>{const scope=active.current;if(scope?.writer&&scope.confirmedWriter!==scope.writer&&scope.capturedView!==statsView)scope.writer.retire();},[statsView]);
  const scope=active.current,visible=scope?.key===key&&scope.mounted&&eligible?scope:null;
  const fields=form.key===key&&eligible?form.fields:blank(),candidate=adminUserCreationCandidate(fields);
  const canCreate=!!visible&&visible.current()&&!!statsView&&!visible.running&&attempts.current.size<10000&&!!candidate&&!attempts.current.has(candidate.email);
  const change=(field:keyof AdminUserCreationForm,value:string)=>{
    if(!visible?.current()||live.current.key!==key||formRef.current.key!==key||!['email','name','password'].includes(field)||typeof value!=='string')return;
    const next={key,version:++serial.current,fields:{...formRef.current.fields,[field]:value}};formRef.current=next;setForm(next);visible.writer?.retire();
  };
  const create=()=>{
    if(!canCreate||!visible||!candidate||!visible.current()||visible.running||attempts.current.size>=10000||attempts.current.has(candidate.email))return;
    const submitted=formRef.current,version=submitted.version,capturedView=statsView,refresh=refreshStats;
    if(submitted.key!==key||submitted.version!==form.version||live.current.statsView!==capturedView)return;
    attempts.current.add(candidate.email);visible.writer?.retire();visible.confirmedWriter=null;visible.running=true;visible.capturedView=capturedView;
    let writer:Writer;
    writer=beginAdminUserCreation({id:id!,email:email!,expiresAt},submitted.fields,()=>visible.current()&&formRef.current.key===key&&formRef.current.version===version&&(!writer||visible.writer===writer)&&(visible.confirmedWriter===writer||live.current.statsView===capturedView),()=>{void Promise.resolve().then(()=>{if(visible.current()&&visible.writer===writer)setView({scope:visible,writer,receipt:null,phase:visible.confirmedWriter===writer?'idle':'unconfirmed'});});});
    visible.writer=writer;setView({scope:visible,writer,receipt:null,phase:'pending'});
    void writer.original.then(receipt=>{
      if(!visible.current()||visible.writer!==writer||formRef.current.version!==version||!writer.created(receipt))return;
      // Only an original private ACK can cross this transition. Once observed,
      // our own stats refresh may replace its display without undoing that ACK.
      visible.confirmedWriter=writer;visible.running=false;
      const next={key,version,fields:blank()};formRef.current=next;setForm(next);setView({scope:visible,writer,receipt,phase:'confirmed'});
      if(visible.current()&&visible.writer===writer&&writer.confirmed(receipt))refresh();
    }).catch(()=>{writer.retire();if(visible.writer===writer){visible.running=false;if(visible.current())setView({scope:visible,writer,receipt:null,phase:'unconfirmed'});}}).finally(()=>{if(visible.writer===writer)visible.running=false;});
  };
  const shown=visible&&view.scope===visible&&visible.current()?view:null,created=shown?.phase==='confirmed'?shown.writer?.created(shown.receipt):null;
  return{form:fields,change,create,canCreate,creating:shown?.phase==='pending',message:created?'Usuario '+created.email+' creado.':shown?.phase==='pending'?'Esperando confirmación de creación…':shown?.phase==='unconfirmed'?unconfirmed:'',confirmed:!!created};
}
