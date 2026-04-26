'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? '';

type SocialPost = {
  id: string; platform: string; content: string; status: string;
  publishedAt: string | null; createdAt: string; errorMsg: string | null; bufferId: string | null;
};
type SocialMessage = {
  id: string; platform: string; fromUser: string; content: string;
  externalId: string | null; receivedAt: string; replied: boolean;
  replyContent: string | null; repliedAt: string | null;
};
type Status = { youtube: boolean; gmail: boolean; facebook: boolean; instagram: boolean; linkedin: boolean; tiktok: boolean; twitter: boolean };
type AdminData = { posts: SocialPost[]; messages: SocialMessage[]; status: Status };
type LogEntry = { type: 'info' | 'success' | 'error'; msg: string; ts: string };

const PLATFORM_EMOJI: Record<string, string> = {
  facebook: '📘', instagram: '📸', linkedin: '💼',
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
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-mono-jb font-semibold" style={{ background: s.bg, color: s.color }}>
      {status}
    </span>
  );
}

function PreviewModal({ data, onClose }: { data: Record<string, string | null>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.9)' }}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden soft-card" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text)' }}>Preview — sin publicar</h3>
          <button onClick={onClose} className="text-sm" style={{ color: 'var(--text-faint)' }}>✕</button>
        </div>
        <div className="p-6 space-y-5">
          {Object.entries(data).map(([platform, content]) => content ? (
            <div key={platform}>
              <div className="text-xs font-mono-jb mb-2 uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
                {PLATFORM_EMOJI[platform]} {platform}
              </div>
              <div className="rounded-xl p-4 text-xs leading-relaxed whitespace-pre-wrap" style={{ background: 'var(--ink-3)', border: '1px solid var(--line)', color: 'var(--text-dim)' }}>
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
  const [data, setData] = useState<AdminData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, string | null> | null>(null);

  const addLog = useCallback((type: LogEntry['type'], msg: string) => {
    setLogs(prev => [{ type, msg, ts: new Date().toLocaleTimeString('es-ES') }, ...prev].slice(0, 100));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/social');
      if (res.ok) setData(await res.json());
    } catch { addLog('error', 'Error cargando datos'); }
  }, [addLog]);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated' && session?.user?.email !== ADMIN_EMAIL) { router.push('/dashboard'); return; }
    if (status === 'authenticated') fetchData();
  }, [status, session, router, fetchData]);

  useEffect(() => {
    const t = setInterval(fetchData, 30_000);
    return () => clearInterval(t);
  }, [fetchData]);

  const runAction = async (action: string, type?: string) => {
    setLoading(action);
    addLog('info', `Ejecutando ${action}${type ? ` (${type})` : ''}...`);
    try {
      const res = await fetch('/api/agent/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, type }) });
      const result = await res.json();
      if (result.ok) {
        addLog('success', `✓ ${action} completado`);
        if (action === 'test' && result.preview) setPreview(result.preview);
        await fetchData();
      } else {
        addLog('error', `✗ ${result.error ?? 'Error desconocido'}`);
      }
    } catch (err) {
      addLog('error', `✗ Red: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setLoading(null); }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen grid-bg grain flex items-center justify-center" style={{ background: 'var(--ink)' }}>
        <div className="w-6 h-6 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: 'var(--red)' }} />
      </div>
    );
  }

  const logColors = { info: 'var(--text-faint)', success: '#22c55e', error: '#f87171' };

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      {preview && <PreviewModal data={preview} onClose={() => setPreview(null)} />}

      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-md" style={{ background: 'rgba(10,10,10,0.9)', borderBottom: '1px solid var(--line)' }}>
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="font-display font-bold text-base tracking-tight">
              YTubViral<span style={{ color: 'var(--red)' }}>.</span>com
            </a>
            <span className="red-tape">Social</span>
          </div>
          <button onClick={() => router.push('/admin')} className="text-xs transition" style={{ color: 'var(--text-faint)' }}>
            ← Admin
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* Header */}
        <div>
          <h1 className="font-display text-2xl font-bold">Agente Social</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>Panel de control del agente de redes sociales</p>
        </div>

        {/* Estado */}
        <section>
          <p className="text-xs font-mono-jb uppercase tracking-widest mb-3" style={{ color: 'var(--text-faint)' }}>Estado de integraciones</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {data?.status && (Object.entries({
              YouTube: data.status.youtube, Gmail: data.status.gmail,
              Facebook: data.status.facebook, Instagram: data.status.instagram,
              LinkedIn: data.status.linkedin, TikTok: null, Twitter: null,
            }) as [string, boolean | null][]).map(([label, connected]) => (
              <div key={label} className="soft-card rounded-xl p-3">
                <div className="text-xs mb-1" style={{ color: 'var(--text-faint)' }}>
                  {PLATFORM_EMOJI[label.toLowerCase()] ?? '🔗'} {label}
                </div>
                <div className="text-xs font-semibold font-mono-jb" style={{ color: connected === null ? '#fbbf24' : connected ? '#22c55e' : '#f87171' }}>
                  {connected === null ? 'Manual' : connected ? 'OK' : 'Error'}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Acciones */}
        <section>
          <p className="text-xs font-mono-jb uppercase tracking-widest mb-3" style={{ color: 'var(--text-faint)' }}>Acciones rápidas</p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => runAction('publish', 'morning')} disabled={loading === 'publish'} className="btn-offset px-5 py-2.5 text-sm rounded-xl disabled:opacity-40">
              {loading === 'publish' ? 'Publicando...' : 'Publicar mañana'}
            </button>
            <button onClick={() => runAction('publish', 'evening')} disabled={loading === 'publish'} className="btn-offset px-5 py-2.5 text-sm rounded-xl disabled:opacity-40">
              Publicar tarde
            </button>
            <button onClick={() => runAction('messages')} disabled={loading === 'messages'} className="btn-offset-ghost px-5 py-2.5 text-sm rounded-xl">
              {loading === 'messages' ? 'Revisando...' : 'Revisar mensajes'}
            </button>
            <button onClick={() => runAction('test', 'morning')} disabled={loading === 'test'} className="px-5 py-2.5 text-sm rounded-xl font-semibold transition" style={{ background: 'var(--ink-3)', border: '1px solid var(--line-2)', color: 'var(--text-dim)' }}>
              Test (sin publicar)
            </button>
          </div>
        </section>

        {/* Publicaciones */}
        <section>
          <p className="text-xs font-mono-jb uppercase tracking-widest mb-3" style={{ color: 'var(--text-faint)' }}>Historial de publicaciones</p>
          <div className="soft-card rounded-2xl overflow-hidden">
            {!data?.posts.length ? (
              <p className="p-6 text-sm" style={{ color: 'var(--text-faint)' }}>Sin publicaciones aún.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 680 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                      {['Plataforma', 'Contenido', 'Estado', 'Error', 'Fecha'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-mono-jb uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{h}</th>
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
                          <span className="block max-w-xs truncate text-xs" title={post.content}>{post.content}</span>
                        </td>
                        <td className="px-5 py-3"><StatusBadge status={post.status} /></td>
                        <td className="px-5 py-3">
                          {post.errorMsg
                            ? <span className="text-xs block max-w-[160px] truncate" style={{ color: '#f87171' }} title={post.errorMsg}>{post.errorMsg}</span>
                            : <span style={{ color: 'var(--line-2)' }}>—</span>}
                        </td>
                        <td className="px-5 py-3 text-xs whitespace-nowrap font-mono-jb" style={{ color: 'var(--text-faint)' }}>{fmt(post.createdAt)}</td>
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
          <p className="text-xs font-mono-jb uppercase tracking-widest mb-3" style={{ color: 'var(--text-faint)' }}>Mensajes recibidos</p>
          <div className="soft-card rounded-2xl overflow-hidden">
            {!data?.messages.length ? (
              <p className="p-6 text-sm" style={{ color: 'var(--text-faint)' }}>Sin mensajes procesados aún.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 680 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                      {['Red', 'Remitente', 'Mensaje', 'Estado', 'Hora'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-mono-jb uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.messages.map(msg => {
                      const gmailUrl = msg.platform === 'gmail' && msg.externalId
                        ? `https://mail.google.com/mail/u/0/#inbox/${msg.externalId}` : null;
                      return (
                        <tr key={msg.id} style={{ borderBottom: '1px solid var(--line)', cursor: gmailUrl ? 'pointer' : 'default' }}
                          className="transition-colors hover:bg-white/[0.02]"
                          onClick={() => gmailUrl && window.open(gmailUrl, '_blank')}>
                          <td className="px-5 py-3 font-medium whitespace-nowrap text-sm" style={{ color: 'var(--text)' }}>
                            {PLATFORM_EMOJI[msg.platform] ?? '🔗'} {msg.platform}
                            {gmailUrl && <span className="ml-1 text-xs" style={{ color: 'var(--text-faint)' }}>↗</span>}
                          </td>
                          <td className="px-5 py-3">
                            <span className="block max-w-[140px] truncate text-xs" style={{ color: 'var(--text-dim)' }} title={msg.fromUser}>{msg.fromUser}</span>
                          </td>
                          <td className="px-5 py-3">
                            <span className="block max-w-xs truncate text-xs" style={{ color: 'var(--text-dim)' }} title={msg.content}>{msg.content}</span>
                          </td>
                          <td className="px-5 py-3">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-mono-jb font-semibold"
                              style={{ background: msg.replied ? 'rgba(34,197,94,0.12)' : 'rgba(251,191,36,0.12)', color: msg.replied ? '#22c55e' : '#fbbf24' }}>
                              {msg.replied ? 'Respondido' : 'Pendiente'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-xs whitespace-nowrap font-mono-jb" style={{ color: 'var(--text-faint)' }}>{fmt(msg.receivedAt)}</td>
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
            <p className="text-xs font-mono-jb uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Logs</p>
            <button onClick={() => setLogs([])} className="text-xs transition" style={{ color: 'var(--text-faint)' }}>Limpiar</button>
          </div>
          <div className="rounded-2xl p-4 h-40 overflow-y-auto font-mono-jb text-xs space-y-1" style={{ background: 'var(--ink-3)', border: '1px solid var(--line)' }}>
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
        <p className="text-center text-xs font-mono-jb" style={{ color: 'var(--text-faint)' }}>Panel privado · YTubViral</p>
      </footer>
    </div>
  );
}
