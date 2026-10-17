'use client';
import { useEffect, useRef, useState } from 'react';
import { adminGmailReviewBlocked, beginAdminGmailReview, type GmailReviewOwner, type GmailReviewView } from '@/lib/admin-gmail-review-client';
type Session = { user?: { id?: string; email?: string|null; authSessionRef?: string; isAdmin?: boolean; requiresTotp?: boolean; requiresVerification?: boolean }; expires?: string } | null;
type Writer = ReturnType<typeof beginAdminGmailReview>;
type Scope = { key: string; mounted: boolean; running: boolean; writer: Writer|null; current: () => boolean };
export function useAdminGmailReview(session: Session, status: string, busy: { current: boolean }) {
  const user = session?.user, id = user?.id, email = user?.email, authSessionRef = user?.authSessionRef, expiresAt = Date.parse(session?.expires ?? '');
  const eligible = status === 'authenticated' && user?.isAdmin === true && user.requiresTotp === false && user.requiresVerification === false && !!id && !!email
    && typeof authSessionRef === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(authSessionRef) && expiresAt > Date.now();
  const key = JSON.stringify([id,email,authSessionRef,session?.expires,status,user?.isAdmin,user?.requiresTotp,user?.requiresVerification]);
  const live = useRef({key,eligible}); live.current = {key,eligible};
  const active = useRef<Scope|null>(null), lock = useRef<Scope|null>(null);
  const owner: GmailReviewOwner = {id:id ?? '',email:email ?? '',authSessionRef:authSessionRef ?? '',expiresAt};
  const [view,setView] = useState<{scope:Scope|null;phase:'idle'|'pending'|'unconfirmed'|'result';read?:GmailReviewView}>({scope:null,phase:'idle'});
  useEffect(() => {
    const scope: Scope = {key,mounted:true,running:false,writer:null,current:()=>false}; active.current = scope;
    scope.current = () => scope.mounted && active.current === scope && live.current.key === key && live.current.eligible && document.visibilityState === 'visible' && document.hasFocus();
    const blocked = adminGmailReviewBlocked(owner);
    if (blocked) busy.current=true;
    setView({scope,phase:blocked?'unconfirmed':'idle'});
    const hide = () => scope.writer?.retire(), visibility = () => { if (document.visibilityState === 'hidden') hide(); };
    document.addEventListener('visibilitychange',visibility); window.addEventListener('blur',hide); window.addEventListener('pagehide',hide);
    return () => { scope.mounted=false;scope.writer?.retire();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',hide);window.removeEventListener('pagehide',hide); };
  },[key]);
  const visible = active.current?.key === key && active.current.mounted && eligible ? active.current : null;
  const start = () => {
    if (!visible?.current() || visible.running || busy.current || adminGmailReviewBlocked(owner)) return;
    visible.running=true;busy.current=true;lock.current=visible;
    const unlockUnissued = (writer:Writer) => { if (!writer.sent() && lock.current === visible) {lock.current=null;busy.current=false;} };
    let writer: Writer;
    writer=beginAdminGmailReview(owner,()=>visible.current()&&(!writer||visible.writer===writer),()=>{void Promise.resolve().then(()=>{
      if (visible.writer!==writer) return; visible.running=false;unlockUnissued(writer);
      if(visible.mounted&&active.current===visible&&live.current.key===visible.key)setView({scope:visible,phase:'unconfirmed'});
    });});
    visible.writer=writer;setView({scope:visible,phase:'pending'});
    void writer.original.then(read=>{
      if(visible.writer!==writer||!visible.current()||!writer.display(read)){writer.retire();return;}
      setView({scope:visible,phase:'result',read});
    }).catch(()=>writer.retire()).finally(()=>{
      if(visible.writer!==writer)return;visible.running=false;unlockUnissued(writer);
      if(!writer.sent()&&visible.current())setView({scope:visible,phase:'unconfirmed'});
    });
  };
  const shown = visible && view.scope===visible ? view : null;
  const data=shown?.phase==='result'?shown.scope?.writer?.display(shown.read)??null:null;
  return {start,data,running:shown?.phase==='pending',canStart:!!visible&&visible.current()&&!visible.running&&!busy.current&&!adminGmailReviewBlocked(owner),
    message:shown?.phase==='pending'?'Leyendo textos Gmail…':shown?.phase==='unconfirmed'?'No se pudo confirmar la lectura de Gmail. No se ha reintentado.':''};
}
