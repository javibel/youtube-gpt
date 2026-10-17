'use client';

import type {GmailTextSkipReason,GmailTextExclusions} from '@/lib/agent/gmail-metadata-original';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import { useEffect, useState, useRef } from 'react';
import { useAdminSocialPreview } from '@/lib/use-admin-social-preview';
import { useAdminSocialPublication } from '@/lib/use-admin-social-publication';
import { useAdminYoutubeReview } from '@/lib/use-admin-youtube-review';
import { useAdminGmailReview } from '@/lib/use-admin-gmail-review';
import { useAdminGmailDraft } from '@/lib/use-admin-gmail-draft';
import { useAdminYoutubeDraft } from '@/lib/use-admin-youtube-draft';
import { useAdminSocialMessages } from '@/lib/use-admin-social-messages';
import { useAdminSocialState } from '@/lib/use-admin-social-state';

function GmailExclusionSummary({counts}:{counts:GmailTextExclusions}){
  return <div><p>Mensajes pendientes de revisión manual, agrupados por un único motivo principal:</p>
    <ul className="list-disc pl-5">
      {Object.entries({attachment:'Adjuntos o contenido separado',alternative:'Versiones alternativas',html:'Contenido HTML',otherMime:'Otros formatos',encoding:'Codificación o cabeceras de texto no admitidas',structure:'Estructura no seleccionable con seguridad'}).map(([reason,label])=>{
        const count=counts[reason as GmailTextSkipReason];return count?<li key={reason}>{label}: {count}</li>:null;
      })}
    </ul>
  </div>;
}

type LogEntry = { type: 'info' | 'success' | 'error'; msg: string; ts: string };

const PLATFORM_EMOJI: Record<string, string> = {
  facebook: '📘', instagram: '📸',
  tiktok: '🎵', twitter: '🐦', youtube: '▶️', gmail: '📧',
};

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    published: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e' },
    email_sent: { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa' },
    failed: { bg: 'rgba(239,68,68,0.12)', color: '#f87171' },
    pending: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24' },
  };
  const s = map[status] ?? { bg: 'rgba(255,255,255,0.06)', color: '#a1a1aa' };
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[13px] font-mono-jb font-semibold" style={{ background: s.bg, color: s.color }}>
      {status}
    </span>
  );
}

function PreviewModal({ data, onClose }: { data: Record<string, string | null>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.9)' }}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden yv-card" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text)' }}>Preview — sin publicar</h3>
          <button onClick={onClose} className="text-sm" style={{ color: 'var(--text-faint)' }}>✕</button>
        </div>
        <div className="p-6 space-y-5">
          {Object.entries(data).map(([platform, content]) => content ? (
            <div key={platform}>
              <div className="text-[13px] font-mono-jb mb-2 uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
                {PLATFORM_EMOJI[platform]} {platform}
              </div>
              <div className="rounded-xl p-4 text-[13px] leading-relaxed whitespace-pre-wrap" style={{ background: 'var(--ink-3)', border: '1px solid var(--line)', color: 'var(--text-dim)' }}>
                {content}
              </div>
            </div>
          ) : null)}
        </div>
      </div>
    </div>
  );
}

export default function SocialAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const history = useAdminSocialState(session,status);
  const data = history.data;
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const actionInFlight=useRef(false);
  const preview = useAdminSocialPreview(session,status,actionInFlight);
  const publication = useAdminSocialPublication(session,status,actionInFlight);
  const messages = useAdminSocialMessages(session,status,actionInFlight);
  const youtubeReview=useAdminYoutubeReview(session,status,actionInFlight);
  const gmailReview=useAdminGmailReview(session,status,actionInFlight);
  const gmailDraft=useAdminGmailDraft(session,status,actionInFlight);
  const youtubeDraft=useAdminYoutubeDraft(session,status,actionInFlight);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && !(session?.user as {isAdmin?:boolean})?.isAdmin) router.push('/dashboard');
  },[status,session,router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen grid-bg grain flex items-center justify-center" style={{ background: 'var(--ink)' }}>
        <div className="w-6 h-6 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: 'var(--yv-brand)' }} />
      </div>
    );
  }

  const logColors = { info: 'var(--text-faint)', success: '#22c55e', error: '#f87171' };

  return (
    <DashboardShell>
      {preview.data && <PreviewModal data={preview.data} onClose={preview.close} />}

      <div className="yv-page yv-page--wide space-y-8">

        {/* Header */}
        <div className="yv-page-header">
          <div className="yv-page-header__left">
            <h1 className="yv-page-header__title">Agente Social</h1>
            <p className="yv-page-header__desc">Panel de control del agente de redes sociales</p>
          </div>
        </div>

        {/* Estado */}
        <section>
          <p className="text-[13px] font-mono-jb uppercase tracking-widest mb-3" style={{ color: 'var(--text-faint)' }}>Configuración de integraciones</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            <p role="status" className="text-sm mb-3" style={{color:'var(--text-faint)'}}>{history.message}</p>
            {data?.status && (Object.entries({
              YouTube: data.status.youtube, Gmail: data.status.gmail,
              Facebook: data.status.facebook, Instagram: data.status.instagram,
              TikTok: data.status.tiktok, Twitter: data.status.twitter,
            }) as [string, string][]).map(([label, connected]) => (
              <div key={label} className="yv-card p-3">
                <div className="text-[13px] mb-1" style={{ color: 'var(--text-faint)' }}>
                  {PLATFORM_EMOJI[label.toLowerCase()] ?? '🔗'} {label}
                </div>
                <div className="text-[13px] font-semibold font-mono-jb" style={{ color: 'var(--text-dim)' }}>
                  {({configured:'Configurada', 'not-configured':'Sin configurar',disabled:'Desactivada',manual:'Manual'}[connected])}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Acciones */}
        <section>
          <p className="text-[13px] font-mono-jb uppercase tracking-widest mb-3" style={{ color: 'var(--text-faint)' }}>Acciones rápidas</p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => publication.start('morning')} disabled={!publication.canStart} className="btn-offset px-5 py-2.5 text-sm rounded-xl disabled:opacity-40">
              {publication.running ? 'Publicando...' : 'Publicar mañana'}
            </button>
            <button onClick={() => publication.start('evening')} disabled={!publication.canStart} className="btn-offset px-5 py-2.5 text-sm rounded-xl disabled:opacity-40">
              Publicar tarde
            </button>
            <button onClick={messages.start} disabled={!messages.canStart} className="btn-offset-ghost px-5 py-2.5 text-sm rounded-xl">
              {messages.running ? 'Revisando...' : 'Revisar mensajes'}
            </button>
            <button onClick={youtubeReview.start} disabled={!youtubeReview.canStart} className="btn-offset-ghost px-5 py-2.5 text-sm rounded-xl disabled:opacity-40">
              {youtubeReview.running?'Leyendo YouTube…':'Revisar comentarios YouTube'}
            </button>
            <button onClick={gmailReview.start} disabled={!gmailReview.canStart} className="btn-offset-ghost px-5 py-2.5 text-sm rounded-xl disabled:opacity-40">
              {gmailReview.running?'Leyendo Gmail…':'Revisar textos Gmail'}
            </button>
            <button onClick={gmailDraft.start} disabled={!gmailDraft.canStart} className="btn-offset-ghost px-5 py-2.5 text-sm rounded-xl disabled:opacity-40">
              {gmailDraft.running?'Preparando borrador…':'Preparar borrador Gmail'}
            </button>
            <button onClick={youtubeDraft.start} disabled={!youtubeDraft.canStart} className="btn-offset-ghost px-5 py-2.5 text-sm rounded-xl disabled:opacity-40">
              {youtubeDraft.running?'Preparando borrador…':'Preparar borrador YouTube'}
            </button>
            <button onClick={preview.start} disabled={!preview.canStart} className="px-5 py-2.5 text-sm rounded-xl font-semibold transition" style={{ background: 'var(--ink-3)', border: '1px solid var(--line-2)', color: 'var(--text-dim)' }}>
              Test (sin publicar)
            </button>
          </div>
          {messages.message && <p role="status" className="mt-3 text-sm" style={{color:'var(--text-dim)'}}>{messages.message}</p>}
          {messages.data && (
            <section aria-label="Lectura parcial de mensajes" role="status" className="yv-card mt-3 p-4 space-y-2 text-sm" style={{color:'var(--text-dim)'}}>
              <h2 className="font-semibold" style={{color:'var(--text)'}}>Lectura parcial</h2>
              <p>La revisión completa sigue pendiente.</p>
              <div>
                <p>{messages.data.youtube.status==='unavailable'?'YouTube: lectura no disponible.':
                  'YouTube: '+messages.data.youtube.scanned+' '+(messages.data.youtube.scanned===1?'comentario leído':'comentarios leídos')+' en '+messages.data.youtube.pages+' '+(messages.data.youtube.pages===1?'página.':'páginas.')}</p>
                {messages.data.youtube.status==='read-only'&&messages.data.youtube.hasMore&&<p>Hay más comentarios fuera de esta lectura.</p>}
              </div>
              <div>
                <p>{messages.data.gmail.status==='unavailable'?'Gmail: lectura no disponible.':
                  'Gmail: '+messages.data.gmail.scanned+' '+(messages.data.gmail.scanned===1?'mensaje':'mensajes')+' (sólo cabeceras).'}</p>
                {messages.data.gmail.status==='read-only-metadata'&&messages.data.gmail.text&&<div>
                  <p>Texto plano simple: {messages.data.gmail.text.read} leídos. Otros formatos sin extraer: {messages.data.gmail.text.skipped}.</p>
                  {messages.data.gmail.text.skipped>0&&<GmailExclusionSummary counts={messages.data.gmail.text.exclusions}/>}
                </div>}
                {messages.data.gmail.status==='read-only-metadata'&&messages.data.gmail.hasMore&&<p>Hay más mensajes fuera de esta lectura.</p>}
              </div>
            </section>
          )}
          {youtubeReview.message&&<p role="status" className="mt-3 text-sm" style={{color:'var(--text-dim)'}}>{youtubeReview.message}</p>}
          {youtubeReview.data&&<section aria-label="Comentarios YouTube para revisión manual" className="yv-card mt-3 p-4 space-y-3 text-sm" style={{color:'var(--text-dim)'}}>
            <h2 className="font-semibold" style={{color:'var(--text)'}}>Comentarios YouTube para revisión manual</h2>
            <p>{youtubeReview.data.scanned} comentarios examinados en {youtubeReview.data.pages} páginas; {youtubeReview.data.eligible} seleccionables y {youtubeReview.data.scanned-youtubeReview.data.eligible} sin seleccionar.</p>
            <p>Esta lectura no prepara borradores ni envía respuestas.</p>
            {youtubeReview.data.hasMore&&<p>Hay más comentarios fuera de esta lectura.</p>}
            {youtubeReview.data.comments.length===0&&<p>No hay comentarios seleccionables en esta lectura.</p>}
            {youtubeReview.data.comments.map((comment,index)=><article key={index} className="rounded-xl p-4 space-y-2" style={{background:'var(--ink-3)',border:'1px solid var(--line)'}}>
              <h3 className="font-semibold" style={{color:'var(--text)'}}>Comentario {index+1}</h3>
              <p>Autor: {comment.author}</p><div className="whitespace-pre-wrap break-words max-h-72 overflow-auto">{comment.text}</div>
            </article>)}
            <p>La revisión completa sigue pendiente.</p>
          </section>}
          {gmailReview.message&&<p role="status" className="mt-3 text-sm" style={{color:'var(--text-dim)'}}>{gmailReview.message}</p>}
          {gmailReview.data&&<section aria-label="Textos Gmail para revisión manual" className="yv-card mt-3 p-4 space-y-3 text-sm" style={{color:'var(--text-dim)'}}>
            <h2 className="font-semibold" style={{color:'var(--text)'}}>Textos Gmail para revisión manual</h2>
            <p>{gmailReview.data.scanned} mensajes examinados; {gmailReview.data.read} con texto legible y {gmailReview.data.skipped} sin extraer.</p>
            <p>Esta lectura no prepara borradores ni envía respuestas.</p>
            {gmailReview.data.skipped>0&&<GmailExclusionSummary counts={gmailReview.data.exclusions}/>}
            {gmailReview.data.hasMore&&<p>Hay más mensajes fuera de esta lectura.</p>}
            {gmailReview.data.messages.length===0&&<p>No hay textos seleccionables en esta lectura.</p>}
            {gmailReview.data.messages.map((message,index)=><article key={index} className="rounded-xl p-4 space-y-2" style={{background:'var(--ink-3)',border:'1px solid var(--line)'}}>
              <h3 className="font-semibold" style={{color:'var(--text)'}}>Mensaje {index+1}</h3>
              <p>De: {message.from}</p><p>Asunto: {message.subject||'(Sin asunto)'}</p>
              <div className="whitespace-pre-wrap break-words max-h-72 overflow-auto">{message.text||'(Texto vacío)'}</div>
            </article>)}
            <p>La revisión completa sigue pendiente.</p>
          </section>}
          {gmailDraft.message&&<p role="status" className="mt-3 text-sm" style={{color:'var(--text-dim)'}}>{gmailDraft.message}</p>}
          {gmailDraft.data?.kind==='no-eligible-source'&&<section aria-label="Borrador Gmail no disponible" className="yv-card mt-3 p-4 space-y-2 text-sm" style={{color:'var(--text-dim)'}}>
            <h2 className="font-semibold" style={{color:'var(--text)'}}>Borrador Gmail no disponible</h2>
            <p>No hay una fuente legible para preparar el borrador en esta lectura.</p>
            <p>{gmailDraft.data.scanned} mensajes examinados; no se ha generado ningún borrador.</p>
            {gmailDraft.data.scanned>0&&<GmailExclusionSummary counts={gmailDraft.data.exclusions}/>}
            {gmailDraft.data.hasMore&&<p>Hay más mensajes fuera de esta lectura.</p>}
            <p>La revisión completa sigue pendiente.</p>
          </section>}
          {gmailDraft.data?.kind==='draft'&&<section aria-label="Borrador Gmail para revisión" className="yv-card mt-3 p-4 space-y-3 text-sm" style={{color:'var(--text-dim)'}}>
            <h2 className="font-semibold" style={{color:'var(--text)'}}>Borrador Gmail para revisión</h2>
            <p>No enviado. Comprueba el mensaje de origen y la respuesta antes de cualquier envío.</p>
            <div aria-label="Alcance de la lectura del borrador Gmail">
              <p>Lectura que acompaña a este borrador: {gmailDraft.data.coverage.scanned} mensajes examinados; {gmailDraft.data.coverage.read} con texto legible y {gmailDraft.data.coverage.skipped} sin extraer.</p>
              <p>Este borrador corresponde a un único mensaje de esa lectura.</p>
              {gmailDraft.data.coverage.skipped>0&&<GmailExclusionSummary counts={gmailDraft.data.coverage.exclusions}/>}
              {gmailDraft.data.coverage.hasMore&&<p>Hay más mensajes fuera de esta lectura.</p>}
            </div>
            <p className="break-words">De: {gmailDraft.data.from}</p>
            <p className="break-words">Asunto: {gmailDraft.data.subject||'Sin asunto'}</p>
            <div className="grid gap-4 lg:grid-cols-2">
              <div><h3 className="font-semibold mb-2">Mensaje de origen (texto plano)</h3><pre className="whitespace-pre-wrap break-words overflow-auto max-h-72 font-sans text-sm">{gmailDraft.data.sourceText}</pre></div>
              <div><h3 className="font-semibold mb-2">Respuesta propuesta</h3><pre className="whitespace-pre-wrap break-words overflow-auto max-h-72 font-sans text-sm">{gmailDraft.data.content}</pre></div>
            </div>
            <p>La revisión completa sigue pendiente.</p>
          </section>}
          {youtubeDraft.message&&<p role="status" className="mt-3 text-sm" style={{color:'var(--text-dim)'}}>{youtubeDraft.message}</p>}
          {youtubeDraft.data?.kind==='no-eligible-source'&&<section aria-label="Borrador YouTube no disponible" className="yv-card mt-3 p-4 space-y-2 text-sm" style={{color:'var(--text-dim)'}}>
            <h2 className="font-semibold" style={{color:'var(--text)'}}>Borrador YouTube no disponible</h2>
            <p>No hay un comentario elegible para preparar un borrador en esta lectura.</p>
            <p>{youtubeDraft.data.coverage.scanned} comentarios examinados en {youtubeDraft.data.coverage.pages} páginas; no se ha generado ningún borrador.</p>
            {youtubeDraft.data.coverage.hasMore&&<p>Hay más comentarios fuera de esta lectura.</p>}
            <p>La revisión completa sigue pendiente.</p>
          </section>}
          {youtubeDraft.data?.kind==='draft'&&<section aria-label="Borrador YouTube para revisión" className="yv-card mt-3 p-4 space-y-3 text-sm" style={{color:'var(--text-dim)'}}>
            <h2 className="font-semibold" style={{color:'var(--text)'}}>Borrador YouTube para revisión</h2>
            <p>No publicado. Comprueba el comentario de origen y la respuesta antes de cualquier publicación.</p>
            <div aria-label="Alcance de la lectura del borrador YouTube">
              <p>Lectura que acompaña a este borrador: {youtubeDraft.data.coverage.scanned} comentarios examinados en {youtubeDraft.data.coverage.pages} páginas; {youtubeDraft.data.coverage.eligible} elegibles para preparar un borrador.</p>
              <p>Esta propuesta corresponde a un único comentario de esa lectura.</p>
              {youtubeDraft.data.coverage.hasMore&&<p>Hay más comentarios fuera de esta lectura.</p>}
            </div>
            <p className="break-words">Autor: {youtubeDraft.data.author}</p>
            <p>Publicado: {fmt(youtubeDraft.data.publishedAt)}</p>
            <div className="grid gap-4 lg:grid-cols-2">
              <div><h3 className="font-semibold mb-2">Comentario de origen (texto plano)</h3><pre className="whitespace-pre-wrap break-words overflow-auto max-h-72 font-sans text-sm">{youtubeDraft.data.sourceText}</pre></div>
              <div><h3 className="font-semibold mb-2">Respuesta propuesta</h3><pre className="whitespace-pre-wrap break-words overflow-auto max-h-72 font-sans text-sm">{youtubeDraft.data.content}</pre></div>
            </div>
            <p>La revisión completa sigue pendiente.</p>
          </section>}
          {preview.message && <p role="status" className="mt-3 text-sm" style={{color:'var(--text-dim)'}}>{preview.message}</p>}
          {publication.message && <p role="status" className="mt-3 text-sm" style={{color:publication.data?'#22c55e':'var(--text-dim)'}}>{publication.message}</p>}
        </section>

        {/* Publicaciones */}
        <section>
          <p className="text-[13px] font-mono-jb uppercase tracking-widest mb-3" style={{ color: 'var(--text-faint)' }}>Historial de publicaciones</p>
          <div className="yv-card overflow-hidden">
            {!data?.posts.length ? (
              <p className="p-6 text-sm" style={{ color: 'var(--text-faint)' }}>{data ? 'Sin publicaciones almacenadas.' : 'Historial de publicaciones no disponible.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 680 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                      {['Plataforma', 'Contenido', 'Estado', 'Error', 'Fecha'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-[13px] font-mono-jb uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.posts.map(post => (
                      <tr key={post.id} style={{ borderBottom: '1px solid var(--line)' }} className="transition-colors hover:bg-white/[0.02]">
                        <td className="px-5 py-3 font-medium whitespace-nowrap text-sm" style={{ color: 'var(--text)' }}>
                          {PLATFORM_EMOJI[post.platform] ?? '🔗'} {post.platform}
                        </td>
                        <td className="px-5 py-3" style={{ color: 'var(--text-dim)' }}>
                          <span className="block max-w-xs truncate text-[13px]" title={post.content}>{post.content}</span>
                        </td>
                        <td className="px-5 py-3"><StatusBadge status={post.status} /></td>
                        <td className="px-5 py-3">
                          {post.errorMsg
                            ? <span className="text-[13px] block max-w-[160px] truncate" style={{ color: '#f87171' }} title={post.errorMsg}>{post.errorMsg}</span>
                            : <span style={{ color: 'var(--line-2)' }}>—</span>}
                        </td>
                        <td className="px-5 py-3 text-[13px] whitespace-nowrap font-mono-jb" style={{ color: 'var(--text-faint)' }}>{fmt(post.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Mensajes */}
        <section>
          <p className="text-[13px] font-mono-jb uppercase tracking-widest mb-3" style={{ color: 'var(--text-faint)' }}>Mensajes recibidos</p>
          <div className="yv-card overflow-hidden">
            {!data?.messages.length ? (
              <p className="p-6 text-sm" style={{ color: 'var(--text-faint)' }}>{data ? 'Sin mensajes almacenados.' : 'Historial de mensajes no disponible.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 680 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                      {['Red', 'Remitente', 'Mensaje', 'Estado', 'Hora'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-[13px] font-mono-jb uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.messages.map(msg => {
                      const gmailUrl = msg.platform === 'gmail' && msg.externalId && /^[a-f0-9]{1,128}$/.test(msg.externalId)
                        ? `https://mail.google.com/mail/u/0/#inbox/${msg.externalId}` : null;
                      return (
                        <tr key={msg.id} style={{ borderBottom: '1px solid var(--line)', cursor: gmailUrl ? 'pointer' : 'default' }}
                          className="transition-colors hover:bg-white/[0.02]"
                          onClick={() => gmailUrl && window.open(gmailUrl, '_blank', 'noopener,noreferrer')}>
                          <td className="px-5 py-3 font-medium whitespace-nowrap text-sm" style={{ color: 'var(--text)' }}>
                            {PLATFORM_EMOJI[msg.platform] ?? '🔗'} {msg.platform}
                            {gmailUrl && <span className="ml-1 text-[13px]" style={{ color: 'var(--text-faint)' }}>↗</span>}
                          </td>
                          <td className="px-5 py-3">
                            <span className="block max-w-[140px] truncate text-[13px]" style={{ color: 'var(--text-dim)' }} title={msg.fromUser}>{msg.fromUser}</span>
                          </td>
                          <td className="px-5 py-3">
                            <span className="block max-w-xs truncate text-[13px]" style={{ color: 'var(--text-dim)' }} title={msg.content}>{msg.content}</span>
                          </td>
                          <td className="px-5 py-3">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[13px] font-mono-jb font-semibold"
                              style={{ background: msg.replied ? 'rgba(34,197,94,0.12)' : 'rgba(251,191,36,0.12)', color: msg.replied ? '#22c55e' : '#fbbf24' }}>
                              {msg.replied ? 'Respondido' : 'Pendiente'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-[13px] whitespace-nowrap font-mono-jb" style={{ color: 'var(--text-faint)' }}>{fmt(msg.receivedAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Logs */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-mono-jb uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Logs</p>
            <button onClick={() => setLogs([])} className="text-[13px] transition" style={{ color: 'var(--text-faint)' }}>Limpiar</button>
          </div>
          <div className="rounded-2xl p-4 h-40 overflow-y-auto font-mono-jb text-[13px] space-y-1" style={{ background: 'var(--ink-3)', border: '1px solid var(--line)' }}>
            {logs.length === 0 && <p style={{ color: 'var(--text-faint)' }}>Sin actividad...</p>}
            {logs.map((l, i) => (
              <div key={i} style={{ color: logColors[l.type] }}>
                <span style={{ color: 'var(--text-faint)' }}>{l.ts}</span>{' '}{l.msg}
              </div>
            ))}
          </div>
        </section>

      </div>

      <footer className="mt-8 py-6" style={{ borderTop: '1px solid var(--line)' }}>
        <p className="text-center text-[13px] font-mono-jb" style={{ color: 'var(--text-faint)' }}>Panel privado · YTubViral</p>
      </footer>
    </DashboardShell>
  );
}
