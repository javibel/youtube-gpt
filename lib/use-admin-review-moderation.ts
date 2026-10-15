'use client';
import { useEffect, useRef, useState } from 'react';
import { beginAdminReviewModeration, type AdminReviewDecision, type AdminReviewModerationReceipt } from '@/lib/admin-review-moderation-client';
import type { AdminReviewsData } from '@/lib/admin-reviews-client';

type Writer=ReturnType<typeof beginAdminReviewModeration>;
type Session={user?:{id?:string;email?:string|null;isAdmin?:boolean;requiresTotp?:boolean;requiresVerification?:boolean};expires?:string}|null;
type Scope={key:string;reviews:AdminReviewsData|null;mounted:boolean;writer:Writer|null;running:boolean;current:()=>boolean;refresh:()=>void};
const unconfirmed='No se pudo confirmar la moderación. No se ha reintentado.';
export function useAdminReviewModeration(session:Session,status:string,reviews:AdminReviewsData|null,refresh:()=>void){
  const user=session?.user,id=user?.id,email=user?.email,expiresAt=Date.parse(session?.expires??'');
  const eligible=status==='authenticated'&&user?.isAdmin===true&&user.requiresTotp===false&&user.requiresVerification===false&&!!id&&!!email&&expiresAt>Date.now()&&!!reviews;
  const key=JSON.stringify([id,email,session?.expires,status,user?.isAdmin,user?.requiresTotp,user?.requiresVerification]);
  const live=useRef({key,eligible,reviews});live.current={key,eligible,reviews};
  const active=useRef<Scope|null>(null),attempts=useRef(new Set<string>());
  const [view,setView]=useState<{scope:Scope|null;writer:Writer|null;receipt:AdminReviewModerationReceipt|null;id:string;status:string;phase:'idle'|'pending'|'confirmed'|'unconfirmed'}>({scope:null,writer:null,receipt:null,id:'',status:'',phase:'idle'});
  useEffect(()=>{
    const scope:Scope={key,reviews,mounted:true,writer:null,running:false,current:()=>false,refresh};active.current=scope;
    scope.current=()=>scope.mounted&&active.current===scope&&live.current.key===key&&live.current.reviews===reviews&&live.current.eligible&&document.visibilityState==='visible'&&document.hasFocus();
    if(eligible&&reviews?.reviews.length)setView({scope,writer:null,receipt:null,id:'',status:'',phase:'idle'});
    const hide=()=>{scope.writer?.retire();if(scope.mounted&&active.current===scope)setView({scope,writer:null,receipt:null,id:'',status:'',phase:scope.writer?'unconfirmed':'idle'});};
    const visibility=()=>{if(document.visibilityState==='hidden')hide();};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',hide);window.addEventListener('pagehide',hide);
    return()=>{scope.mounted=false;scope.writer?.retire();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',hide);window.removeEventListener('pagehide',hide);};
  },[key,reviews]); // eslint-disable-line react-hooks/exhaustive-deps
  const scope=active.current,visible=scope?.key===key&&scope.reviews===reviews&&eligible&&scope.mounted?scope:null;
  const canModerate=(reviewId:string)=>!!visible&&visible.current()&&!visible.running&&attempts.current.size<10000&&!attempts.current.has(reviewId)&&!!reviews?.reviews.some(row=>row.id===reviewId&&row.status==='pending');
  const moderate=(reviewId:string,decision:AdminReviewDecision['status'])=>{
    if(!canModerate(reviewId)||!visible||(decision!=='approved'&&decision!=='rejected'))return;
    // Reserve synchronously before any await. Changing view/session or receiving
    // an uncertain result never releases this local negative target fence.
    attempts.current.add(reviewId);visible.writer?.retire();visible.running=true;
    let writer:Writer;
    writer=beginAdminReviewModeration({id:id!,email:email!,expiresAt},{id:reviewId,status:decision},()=>visible.current()&&(!writer||visible.writer===writer),()=>{void Promise.resolve().then(()=>{if(visible.current()&&visible.writer===writer)setView({scope:visible,writer,receipt:null,id:reviewId,status:decision,phase:'unconfirmed'});});});
    visible.writer=writer;setView({scope:visible,writer,receipt:null,id:reviewId,status:decision,phase:'pending'});
    void writer.original.then(receipt=>{
      if(!visible.current()||visible.writer!==writer||!writer.confirmed(receipt))return;
      visible.running=false;
      setView({scope:visible,writer,receipt,id:reviewId,status:decision,phase:'confirmed'});
      // This callback was captured from this exact reader generation. No old
      // command can refresh a later view, and only an original ACK reaches it.
      if(visible.current()&&visible.writer===writer&&writer.confirmed(receipt))visible.refresh();
    }).catch(()=>{visible.running=false;writer.retire();if(visible.current()&&visible.writer===writer)setView({scope:visible,writer,receipt:null,id:reviewId,status:decision,phase:'unconfirmed'});}).finally(()=>{if(visible.writer===writer){visible.running=false;}});
  };
  const shown=visible&&view.scope===visible&&visible.current()?view:null;
  const confirmed=shown?.phase==='confirmed'&&shown.writer?.confirmed(shown.receipt);
  return{moderate,canModerate,pendingId:shown?.phase==='pending'?shown.id:null,message:confirmed?(shown.status==='approved'?'Reseña aprobada.':'Reseña rechazada.'):shown?.phase==='unconfirmed'?unconfirmed:shown?.phase==='pending'?'Esperando confirmación de moderación…':''};
}
