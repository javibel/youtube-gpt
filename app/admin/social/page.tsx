'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? '';

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const PLATFORM_EMOJI: Record<string, string> = {
  facebook: '📘', instagram: '📸', linkedin: '💼',
  tiktok: '🎵', twitter: '🐦', youtube: '▶️', gmail: '📧',
};

const STATUS_COLOR: Record<string, string> = {
  published: '#22c55e', email_sent: '#3b82f6', failed: '#ef4444', pending: '#f59e0b',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

type LogEntry = { type: 'info' | 'success' | 'error'; msg: string; ts: string };

// ── Preview Modal ─────────────────────────────────────────────────────────────

function PreviewModal({ data, onClose }: { data: Record<string, string | null>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden" style={{ background: '#0d0d18', border: '1px solid rgba(0,217,255,0.15)', maxHeight: '80vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h3 className="font-bold text-white text-sm">Preview — contenido generado (sin publicar)</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-5">
          {Object.entries(data).map(([platform, content]) => content ? (
            <div key={platform}>
              <div className="text-xs text-white/40 mb-1.5 uppercase tracking-wider">{PLATFORM_EMOJI[platform]} {platform}</div>
              <div className="rounded-xl p-4 text-xs text-white/75 whitespace-pre-wrap leading-relaxed" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.07)' }}>{content}</div>
            </div>
          ) : null)}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SocialAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [data, setData] = useState<AdminData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, string | null> | null>(null);

  const addLog = useCallback((type: LogEntry['type'], msg: string) => {
    const ts = new Date().toLocaleTimeString('es-ES');
    setLogs(prev => [{ type, msg, ts }, ...prev].slice(0, 100));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/social');
      if (res.ok) setData(await res.json());
    } catch { addLog('error', 'Error cargando datos del panel'); }
  }, [addLog]);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated' && session?.user?.email !== ADMIN_EMAIL) { router.push('/dashboard'); return; }
    if (status === 'authenticated') fetchData();
  }, [status, session, router, fetchData]);

  useEffect(() => {
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const runAction = async (action: string, type?: string) => {
    setLoading(action);
    addLog('info', `Ejecutando: ${action}${type ? ` (${type})` : ''}...`);
    try {
      const res = await fetch('/api/agent/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, type }) });
      const result = await res.json();
      if (result.ok) {
        addLog('success', `✅ ${action} completado`);
        if (action === 'test' && result.preview) setPreview(result.preview);
        await fetchData();
      } else {
        addLog('error', `❌ Error: ${result.error ?? 'desconocido'}`);
      }
    } catch (err) {
      addLog('error', `❌ Error de red: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setLoading(null); }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#06060f url("/bg.png") center/cover no-repeat fixed' }}>
        <div className="fixed inset-0" style={{ background: 'rgba(6,6,15,0.7)' }} />
        <div className="relative w-8 h-8 rounded-full border border-transparent animate-spin" style={{ borderTopColor: '#00D9FF' }} />
      </div>
    );
  }

  const logColors = { info: 'rgba(255,255,255,0.5)', success: '#22c55e', error: '#ef4444' };

  return (
    <div className="min-h-screen text-white relative overflow-x-hidden" style={{ background: '#06060f url("/bg.png") center/cover no-repeat fixed' }}>

      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-15%', left: '-10%', width: '700px', height: '700px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,217,255,0.15) 0%, transparent 65%)', filter: 'blur(20px)' }} />
        <div style={{ position: 'absolute', top: '30%', right: '-15%', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,0,255,0.12) 0%, transparent 65%)', filter: 'blur(20px)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(6,6,15,0.6)' }} />
      </div>

      {preview && <PreviewModal data={preview} onClose={() => setPreview(null)} />}

      <div className="relative" style={{ zIndex: 1 }}>

        {/* Header */}
        <header className="sticky top-0 z-50 px-6 py-4 backdrop-blur-xl" style={{ borderBottom: '1px solid rgba(255,0,255,0.08)', background: 'rgba(6,6,15,0.85)' }}>
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3">
              <a href="/" className="text-xl font-bold gradient-text">YTubViral.com</a>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,0,255,0.1)', border: '1px solid rgba(255,0,255,0.3)', color: '#FF00FF' }}>SOCIAL</span>
            </div>
            <button onClick={() => router.push('/admin')} className="text-xs text-white/40 hover:text-white transition-colors">← Volver al admin</button>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

          {/* Title */}
          <div>
            <h1 className="text-2xl font-bold text-white">Agente Social</h1>
            <p className="text-gray-500 text-sm mt-1">Panel de control del agente de redes sociales</p>
          </div>

          {/* A. Estado de integraciones */}
          <section>
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Estado de integraciones</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {data?.status && (Object.entries({
                YouTube: data.status.youtube,
                Gmail: data.status.gmail,
                Facebook: data.status.facebook,
                Instagram: data.status.instagram,
                LinkedIn: data.status.linkedin,
                TikTok: null,
                Twitter: null,
              }) as [string, boolean | null][]).map(([label, connected]) => (
                <div key={label} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="text-xs text-white/40 mb-1.5">{PLATFORM_EMOJI[label.toLowerCase()] ?? '🔗'} {label}</div>
                  <div className="text-sm font-bold" style={{ color: connected === null ? '#f59e0b' : connected ? '#22c55e' : '#ef4444' }}>
                    {connected === null ? 'Manual' : connected ? 'Conectado' : 'Desconectado'}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* B. Acciones rápidas */}
          <section>
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Acciones rápidas</h2>
            <div className="flex flex-wrap gap-3">
              {[
                { label: 'Publicar ahora (mañana)', action: 'publish', type: 'morning', color: '#00D9FF' },
                { label: 'Publicar ahora (tarde)', action: 'publish', type: 'evening', color: '#00D9FF' },
                { label: 'Revisar mensajes', action: 'messages', color: '#FF00FF' },
                { label: 'Test post (sin publicar)', action: 'test', type: 'morning', color: 'rgba(255,255,255,0.12)' },
              ].map(btn => (
                <button
                  key={btn.label}
                  onClick={() => runAction(btn.action, btn.type)}
                  disabled={loading === btn.action}
                  className="px-5 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 hover:brightness-110"
                  style={{ background: btn.color, color: btn.color === 'rgba(255,255,255,0.12)' ? '#fff' : '#000', border: btn.color === 'rgba(255,255,255,0.12)' ? '1px solid rgba(255,255,255,0.15)' : 'none' }}
                >
                  {loading === btn.action ? 'Procesando...' : btn.label}
                </button>
              ))}
            </div>
          </section>

          {/* C. Historial de publicaciones — full width scrollable */}
          <section>
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Historial de publicaciones</h2>
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {!data?.posts.length ? (
                <p className="text-white/30 text-sm p-6">Sin publicaciones aún.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        <th className="text-left px-5 py-3 text-xs text-white/30 font-medium uppercase tracking-wider w-32">Plataforma</th>
                        <th className="text-left px-5 py-3 text-xs text-white/30 font-medium uppercase tracking-wider">Contenido</th>
                        <th className="text-left px-5 py-3 text-xs text-white/30 font-medium uppercase tracking-wider w-28">Estado</th>
                        <th className="text-left px-5 py-3 text-xs text-white/30 font-medium uppercase tracking-wider w-48">Error</th>
                        <th className="text-left px-5 py-3 text-xs text-white/30 font-medium uppercase tracking-wider w-36">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.posts.map(post => (
                        <tr key={post.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3 text-white/80 font-medium whitespace-nowrap">
                            {PLATFORM_EMOJI[post.platform] ?? '🔗'} {post.platform}
                          </td>
                          <td className="px-5 py-3 text-white/50">
                            <span className="block max-w-xs truncate" title={post.content}>{post.content}</span>
                          </td>
                          <td className="px-5 py-3">
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap" style={{ background: `${STATUS_COLOR[post.status] ?? '#666'}18`, color: STATUS_COLOR[post.status] ?? '#666', border: `1px solid ${STATUS_COLOR[post.status] ?? '#666'}40` }}>
                              {post.status}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            {post.errorMsg ? (
                              <span className="text-xs text-red-400/70 block max-w-[180px] truncate" title={post.errorMsg}>{post.errorMsg}</span>
                            ) : <span className="text-white/20">—</span>}
                          </td>
                          <td className="px-5 py-3 text-white/40 text-xs whitespace-nowrap">{formatDate(post.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* D. Mensajes recibidos — full width scrollable */}
          <section>
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Mensajes recibidos</h2>
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {!data?.messages.length ? (
                <p className="text-white/30 text-sm p-6">Sin mensajes procesados aún.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        <th className="text-left px-5 py-3 text-xs text-white/30 font-medium uppercase tracking-wider w-28">Red</th>
                        <th className="text-left px-5 py-3 text-xs text-white/30 font-medium uppercase tracking-wider w-44">Remitente</th>
                        <th className="text-left px-5 py-3 text-xs text-white/30 font-medium uppercase tracking-wider">Mensaje</th>
                        <th className="text-left px-5 py-3 text-xs text-white/30 font-medium uppercase tracking-wider w-28">Estado</th>
                        <th className="text-left px-5 py-3 text-xs text-white/30 font-medium uppercase tracking-wider w-36">Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.messages.map(msg => {
                        const gmailUrl = msg.platform === 'gmail' && msg.externalId
                          ? `https://mail.google.com/mail/u/0/#inbox/${msg.externalId}`
                          : null;
                        return (
                          <tr
                            key={msg.id}
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: gmailUrl ? 'pointer' : 'default' }}
                            className="hover:bg-white/[0.03] transition-colors"
                            onClick={() => gmailUrl && window.open(gmailUrl, '_blank')}
                          >
                            <td className="px-5 py-3 text-white/80 font-medium whitespace-nowrap">
                              {PLATFORM_EMOJI[msg.platform] ?? '🔗'} {msg.platform}
                              {gmailUrl && <span className="ml-1 text-white/25 text-xs">↗</span>}
                            </td>
                            <td className="px-5 py-3">
                              <span className="block max-w-[160px] truncate text-white/60 text-xs" title={msg.fromUser}>{msg.fromUser}</span>
                            </td>
                            <td className="px-5 py-3 text-white/50">
                              <span className="block max-w-sm truncate text-xs" title={msg.content}>{msg.content}</span>
                            </td>
                            <td className="px-5 py-3">
                              <span className="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap" style={{ background: msg.replied ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)', color: msg.replied ? '#22c55e' : '#f59e0b', border: `1px solid ${msg.replied ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
                                {msg.replied ? 'Respondido' : 'Pendiente'}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-white/40 text-xs whitespace-nowrap">{formatDate(msg.receivedAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* E. Logs */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">Logs de actividad</h2>
              <button onClick={() => setLogs([])} className="text-xs text-white/25 hover:text-white/60 transition-colors">Limpiar</button>
            </div>
            <div className="rounded-2xl p-4 h-44 overflow-y-auto font-mono text-xs space-y-1" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {logs.length === 0 && <p className="text-white/20">Sin actividad aún...</p>}
              {logs.map((l, i) => (
                <div key={i} style={{ color: logColors[l.type] }}>
                  <span className="text-white/20">{l.ts}</span> {l.msg}
                </div>
              ))}
            </div>
          </section>

        </div>

        <footer className="px-6 py-6 mt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="max-w-7xl mx-auto flex justify-center">
            <p className="text-xs text-gray-700">Panel privado · YTubViral Social Agent</p>
          </div>
        </footer>

      </div>
    </div>
  );
}
