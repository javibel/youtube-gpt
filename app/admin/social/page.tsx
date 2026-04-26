'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? '';

// ── Types ─────────────────────────────────────────────────────────────────────

type SocialPost = {
  id: string;
  platform: string;
  content: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  errorMsg: string | null;
  bufferId: string | null;
};

type SocialMessage = {
  id: string;
  platform: string;
  fromUser: string;
  content: string;
  externalId: string | null;
  receivedAt: string;
  replied: boolean;
  replyContent: string | null;
  repliedAt: string | null;
};

type Status = {
  youtube: boolean;
  gmail: boolean;
  facebook: boolean;
  instagram: boolean;
  linkedin: boolean;
  tiktok: boolean;
  twitter: boolean;
};

type AdminData = { posts: SocialPost[]; messages: SocialMessage[]; status: Status };

// ── Helpers ───────────────────────────────────────────────────────────────────

const PLATFORM_EMOJI: Record<string, string> = {
  facebook: '📘', instagram: '📸', linkedin: '💼',
  tiktok: '🎵', twitter: '🐦', youtube: '▶️', gmail: '📧',
};

const STATUS_COLOR: Record<string, string> = {
  published: '#22c55e', email_sent: '#3b82f6',
  failed: '#ef4444', pending: '#f59e0b',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

// ── Status Card ───────────────────────────────────────────────────────────────

function StatusCard({ label, connected, manual = false }: { label: string; connected: boolean; manual?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 p-4" style={{ background: '#0d0d0d' }}>
      <div className="text-xs text-white/40 mb-2">{PLATFORM_EMOJI[label.toLowerCase()] ?? '🔗'} {label}</div>
      <div
        className="text-sm font-semibold"
        style={{ color: manual ? '#f59e0b' : connected ? '#22c55e' : '#ef4444' }}
      >
        {manual ? 'Manual' : connected ? 'Conectado' : 'Desconectado'}
      </div>
    </div>
  );
}

// ── Action Button ─────────────────────────────────────────────────────────────

function ActionButton({
  label, onClick, loading, color = '#00D9FF',
}: {
  label: string;
  onClick: () => void;
  loading?: boolean;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-5 py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50"
      style={{ background: color, color: '#000' }}
    >
      {loading ? 'Procesando...' : label}
    </button>
  );
}

// ── Log panel ─────────────────────────────────────────────────────────────────

type LogEntry = { type: 'info' | 'success' | 'error'; msg: string; ts: string };

function LogPanel({ logs }: { logs: LogEntry[] }) {
  const colors = { info: '#ffffff80', success: '#22c55e', error: '#ef4444' };
  return (
    <div
      className="rounded-xl border border-white/10 p-4 h-48 overflow-y-auto font-mono text-xs space-y-1"
      style={{ background: '#050505' }}
    >
      {logs.length === 0 && <p className="text-white/30">Sin actividad aún...</p>}
      {logs.map((l, i) => (
        <div key={i} style={{ color: colors[l.type] }}>
          <span className="text-white/30">{l.ts}</span> {l.msg}
        </div>
      ))}
    </div>
  );
}

// ── Preview Modal ─────────────────────────────────────────────────────────────

function PreviewModal({
  data, onClose,
}: {
  data: Record<string, string | null>;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: '#111', maxHeight: '80vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h3 className="font-bold text-white">Preview — contenido generado (sin publicar)</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl">×</button>
        </div>
        <div className="p-6 space-y-6">
          {Object.entries(data).map(([platform, content]) =>
            content ? (
              <div key={platform}>
                <div className="text-xs text-white/40 mb-1 uppercase tracking-wider">
                  {PLATFORM_EMOJI[platform]} {platform}
                </div>
                <div
                  className="rounded-lg p-3 text-xs text-white/80 whitespace-pre-wrap"
                  style={{ background: '#0d0d0d', border: '1px solid #ffffff15' }}
                >
                  {content}
                </div>
              </div>
            ) : null
          )}
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
    } catch {
      addLog('error', 'Error cargando datos del panel');
    }
  }, [addLog]);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated' && session?.user?.email !== ADMIN_EMAIL) {
      router.push('/dashboard'); return;
    }
    if (status === 'authenticated') fetchData();
  }, [status, session, router, fetchData]);

  // Refresh data every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const runAction = async (action: string, type?: string) => {
    setLoading(action);
    addLog('info', `Ejecutando: ${action}${type ? ` (${type})` : ''}...`);
    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, type }),
      });
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
    } finally {
      setLoading(null);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#080808' }}>
        <div className="text-white/40 text-sm">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: '#080808', color: '#fff' }}>
      {preview && <PreviewModal data={preview} onClose={() => setPreview(null)} />}

      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#00D9FF' }}>
              Agente Social — YTubViral
            </h1>
            <p className="text-white/40 text-sm mt-1">Panel de control del agente de redes sociales</p>
          </div>
          <button
            onClick={() => router.push('/admin')}
            className="text-xs text-white/40 hover:text-white transition-colors"
          >
            ← Volver al admin
          </button>
        </div>

        {/* A. STATUS */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">Estado de integraciones</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <StatusCard label="YouTube" connected={data?.status.youtube ?? false} />
            <StatusCard label="Gmail" connected={data?.status.gmail ?? false} />
            <StatusCard label="Facebook" connected={!!data?.status.facebook} />
            <StatusCard label="Instagram" connected={!!data?.status.instagram} />
            <StatusCard label="LinkedIn" connected={!!data?.status.linkedin} />
            <StatusCard label="TikTok" connected={false} manual />
            <StatusCard label="Twitter" connected={false} manual />
          </div>
        </section>

        {/* B. ACCIONES RÁPIDAS */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">Acciones rápidas</h2>
          <div className="flex flex-wrap gap-3">
            <ActionButton
              label="Publicar ahora (mañana)"
              onClick={() => runAction('publish', 'morning')}
              loading={loading === 'publish'}
              color="#00D9FF"
            />
            <ActionButton
              label="Publicar ahora (tarde)"
              onClick={() => runAction('publish', 'evening')}
              loading={loading === 'publish'}
              color="#00D9FF"
            />
            <ActionButton
              label="Revisar mensajes"
              onClick={() => runAction('messages')}
              loading={loading === 'messages'}
              color="#FF00FF"
            />
            <ActionButton
              label="Test post (sin publicar)"
              onClick={() => runAction('test', 'morning')}
              loading={loading === 'test'}
              color="#ffffff20"
            />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* C. HISTORIAL DE PUBLICACIONES */}
          <section>
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
              Historial de publicaciones
            </h2>
            <div className="rounded-xl border border-white/10 overflow-hidden" style={{ background: '#0d0d0d' }}>
              {!data?.posts.length ? (
                <p className="text-white/30 text-xs p-4">Sin publicaciones aún.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left px-4 py-2 text-white/40">Plataforma</th>
                      <th className="text-left px-4 py-2 text-white/40">Contenido</th>
                      <th className="text-left px-4 py-2 text-white/40">Estado</th>
                      <th className="text-left px-4 py-2 text-white/40">Error</th>
                      <th className="text-left px-4 py-2 text-white/40">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.posts.map(post => (
                      <tr key={post.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-4 py-2">
                          {PLATFORM_EMOJI[post.platform] ?? '🔗'} {post.platform}
                        </td>
                        <td className="px-4 py-2 text-white/60 max-w-[160px] truncate">
                          {post.content.slice(0, 60)}...
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{
                              background: `${STATUS_COLOR[post.status] ?? '#666'}20`,
                              color: STATUS_COLOR[post.status] ?? '#666',
                            }}
                          >
                            {post.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-red-400/70 max-w-[160px] text-xs" title={post.errorMsg ?? ''}>
                          <span className="truncate block">{post.errorMsg ? post.errorMsg.slice(0, 40) + '…' : '—'}</span>
                        </td>
                        <td className="px-4 py-2 text-white/40">{formatDate(post.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* D. MENSAJES RECIBIDOS */}
          <section>
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
              Mensajes recibidos
            </h2>
            <div className="rounded-xl border border-white/10 overflow-hidden" style={{ background: '#0d0d0d' }}>
              {!data?.messages.length ? (
                <p className="text-white/30 text-xs p-4">Sin mensajes procesados aún.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left px-4 py-2 text-white/40">Plataforma</th>
                      <th className="text-left px-4 py-2 text-white/40">De</th>
                      <th className="text-left px-4 py-2 text-white/40">Mensaje</th>
                      <th className="text-left px-4 py-2 text-white/40">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.messages.map(msg => {
                      const gmailUrl = msg.platform === 'gmail' && msg.externalId
                        ? `https://mail.google.com/mail/u/0/#all/${msg.externalId}`
                        : null;
                      return (
                        <tr
                          key={msg.id}
                          className="border-b border-white/5 hover:bg-white/5"
                          style={{ cursor: gmailUrl ? 'pointer' : 'default' }}
                          onClick={() => gmailUrl && window.open(gmailUrl, '_blank')}
                        >
                          <td className="px-4 py-2">
                            {PLATFORM_EMOJI[msg.platform] ?? '🔗'} {msg.platform}
                            {gmailUrl && <span className="ml-1 text-white/30">↗</span>}
                          </td>
                          <td className="px-4 py-2 text-white/60 max-w-[100px] truncate">{msg.fromUser}</td>
                          <td className="px-4 py-2 text-white/60 max-w-[160px] truncate">
                            {msg.content.slice(0, 60)}...
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className="px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{
                                background: msg.replied ? '#22c55e20' : '#f59e0b20',
                                color: msg.replied ? '#22c55e' : '#f59e0b',
                              }}
                            >
                              {msg.replied ? 'Respondido' : 'Pendiente'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        {/* E. LOGS */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider">Logs</h2>
            <button
              onClick={() => setLogs([])}
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Limpiar
            </button>
          </div>
          <LogPanel logs={logs} />
        </section>
      </div>
    </div>
  );
}
