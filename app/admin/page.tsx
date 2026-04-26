'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? '';

const TEMPLATE_LABELS: Record<string, string> = {
  title: 'Títulos', description: 'Descripciones', caption: 'Captions',
  thumbnail: 'Thumbnails', script: 'Scripts',
};
const TEMPLATE_COLORS: Record<string, string> = {
  title: '#a855f7', description: '#3b82f6', caption: '#eab308',
  thumbnail: '#ec4899', script: '#22c55e',
};

type AdminData = {
  overview: { totalUsers: number; proUsers: number; freeUsers: number; mrr: number; conversionRate: number; totalGenerations: number };
  thisMonth: { newUsers: number; newUsersLastMonth: number; generations: number; generationsLastMonth: number };
  templateBreakdown: { template: string; count: number }[];
  daily: { date: string; count: number }[];
  recentUsers: { id: string; email: string; name: string | null; createdAt: string; isPro: boolean; generationCount: number }[];
  recentGenerations: { id: string; template: string; createdAt: string; tokensUsed: number; userEmail: string }[];
};
type FeedbackItem = {
  id: string; token: string; lang: string; rating: number | null; comment: string | null;
  submittedAt: string | null; createdAt: string;
  user: { email: string; name: string | null };
};

function Trend({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null;
  const diff = current - previous;
  const pct = Math.round(Math.abs(diff / previous) * 100);
  return (
    <span className="text-xs font-mono-jb" style={{ color: diff > 0 ? '#22c55e' : diff < 0 ? '#f87171' : 'var(--text-faint)' }}>
      {diff > 0 ? '↑' : diff < 0 ? '↓' : '—'}{pct}%
    </span>
  );
}

function Stars({ rating }: { rating: number }) {
  return <span className="text-sm">{[1,2,3,4,5].map(s => <span key={s} style={{ opacity: s <= rating ? 1 : 0.15 }}>⭐</span>)}</span>;
}

function StatCard({ label, value, sub, color = 'var(--red)' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="soft-card rounded-2xl p-5">
      <p className="text-2xl font-display font-bold stat-num" style={{ color }}>{value}</p>
      <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>{label}</p>
      {sub && <p className="text-xs mt-0.5 font-mono-jb" style={{ color: 'var(--text-faint)' }}>{sub}</p>}
    </div>
  );
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reviews, setReviews] = useState<{ id: string; rating: number; text: string; status: string; createdAt: string; user: { email: string; name: string | null } }[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [moderating, setModerating] = useState<string | null>(null);
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [feedbackPending, setFeedbackPending] = useState(0);
  const [feedbacksLoading, setFeedbacksLoading] = useState(true);
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [grantEmail, setGrantEmail] = useState('');
  const [granting, setGranting] = useState(false);
  const [grantMsg, setGrantMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [feedbackSendMsg, setFeedbackSendMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated' && session?.user?.email !== ADMIN_EMAIL) { router.push('/dashboard'); return; }
    if (status === 'authenticated') {
      fetch('/api/admin/stats')
        .then(r => r.json())
        .then(d => { if (d.error) setError(d.error); else setData(d); })
        .catch(e => setError(String(e)))
        .finally(() => setLoading(false));
      fetch('/api/admin/reviews')
        .then(r => r.json())
        .then(d => { if (d.reviews) setReviews(d.reviews); })
        .catch(() => {})
        .finally(() => setReviewsLoading(false));
      fetch('/api/admin/feedback')
        .then(r => r.json())
        .then(d => { if (d.feedbacks) { setFeedbacks(d.feedbacks); setFeedbackPending(d.pending ?? 0); } })
        .catch(() => {})
        .finally(() => setFeedbacksLoading(false));
    }
  }, [status, session, router]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault(); setCreating(true); setCreateMsg(null);
    try {
      const res = await fetch('/api/admin/create-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: createEmail, name: createName, password: createPassword }) });
      const d = await res.json();
      if (d.ok) { setCreateMsg({ ok: true, text: `Usuario ${d.user.email} creado.` }); setCreateEmail(''); setCreateName(''); setCreatePassword(''); fetch('/api/admin/stats').then(r => r.json()).then(d => { if (!d.error) setData(d); }); }
      else setCreateMsg({ ok: false, text: d.error ?? 'Error' });
    } catch { setCreateMsg({ ok: false, text: 'Error de conexión' }); }
    finally { setCreating(false); }
  }

  async function handleSendFeedback(e: React.FormEvent) {
    e.preventDefault(); setSendingFeedback(true); setFeedbackSendMsg(null);
    try {
      const res = await fetch('/api/admin/send-feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: feedbackEmail }) });
      const d = await res.json();
      if (d.ok) { setFeedbackSendMsg({ ok: true, text: `Email enviado a ${d.email} (${d.lang.toUpperCase()})` }); setFeedbackEmail(''); }
      else setFeedbackSendMsg({ ok: false, text: d.error ?? 'Error' });
    } catch { setFeedbackSendMsg({ ok: false, text: 'Error de conexión' }); }
    finally { setSendingFeedback(false); }
  }

  async function handleGrantPro(e: React.FormEvent) {
    e.preventDefault(); setGranting(true); setGrantMsg(null);
    try {
      const res = await fetch('/api/admin/grant-pro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: grantEmail }) });
      const d = await res.json();
      if (d.ok) { setGrantMsg({ ok: true, text: `Pro activado para ${grantEmail}.` }); setGrantEmail(''); fetch('/api/admin/stats').then(r => r.json()).then(d => { if (!d.error) setData(d); }); }
      else setGrantMsg({ ok: false, text: d.error ?? 'Error' });
    } catch { setGrantMsg({ ok: false, text: 'Error de conexión' }); }
    finally { setGranting(false); }
  }

  async function handleModerateReview(id: string, newStatus: 'approved' | 'rejected') {
    setModerating(id);
    try {
      const res = await fetch('/api/admin/reviews', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: newStatus }) });
      const d = await res.json();
      if (d.ok) setReviews(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    } finally { setModerating(null); }
  }

  async function handleDeleteUser(userId: string) {
    setDeleting(userId);
    try {
      const res = await fetch('/api/admin/delete-user', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
      const result = await res.json();
      if (result.error) { alert(result.error); return; }
      setData(prev => prev ? { ...prev, recentUsers: prev.recentUsers.filter(u => u.id !== userId), overview: { ...prev.overview, totalUsers: prev.overview.totalUsers - 1 } } : prev);
    } catch { alert('Error al eliminar'); }
    finally { setDeleting(null); setConfirmDeleteId(null); }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen grid-bg grain flex items-center justify-center" style={{ background: 'var(--ink)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: 'var(--red)' }} />
          <p className="text-xs font-mono-jb" style={{ color: 'var(--text-faint)' }}>Cargando panel...</p>
        </div>
      </div>
    );
  }

  if (error) return <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--ink)' }}><p className="text-sm" style={{ color: '#f87171' }}>{error}</p></div>;
  if (!data) return null;

  const { overview, thisMonth, templateBreakdown, daily, recentUsers, recentGenerations } = data;
  const maxDaily = Math.max(...daily.map(d => d.count), 1);
  const totalTemplates = templateBreakdown.reduce((s, t) => s + t.count, 0);
  const avgRating = feedbacks.length > 0 ? feedbacks.reduce((s, f) => s + (f.rating ?? 0), 0) / feedbacks.length : 0;

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>

      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-md" style={{ background: 'rgba(10,10,10,0.9)', borderBottom: '1px solid var(--line)' }}>
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="font-display font-bold text-base tracking-tight">
              YTubViral<span style={{ color: 'var(--red)' }}>.</span>com
            </a>
            <span className="red-tape">Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/admin/social" className="text-xs font-mono-jb transition" style={{ color: 'var(--text-faint)' }}>
              Agente Social →
            </a>
            <a href="/dashboard" className="text-xs transition" style={{ color: 'var(--text-faint)' }}>Mi cuenta</a>
            <button onClick={() => signOut({ callbackUrl: '/' })} className="text-xs transition" style={{ color: 'var(--text-faint)' }}>Salir</button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* Header + exports */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold">Panel de administración</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>Métricas en tiempo real de YTubViral</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[{ type: 'users', label: 'Usuarios' }, { type: 'generations', label: 'Generaciones' }, { type: 'subscriptions', label: 'Suscripciones' }].map(({ type, label }) => (
              <a key={type} href={`/api/admin/export?type=${type}`}
                className="text-xs font-mono-jb px-3 py-2 rounded-lg transition"
                style={{ background: 'var(--ink-3)', border: '1px solid var(--line-2)', color: 'var(--text-dim)' }}>
                ↓ CSV {label}
              </a>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Usuarios totales" value={overview.totalUsers} sub={`${overview.freeUsers} free · ${overview.proUsers} pro`} />
          <StatCard label="MRR" value={`${overview.mrr.toFixed(2).replace('.', ',')}€`} sub={`${overview.proUsers} Pro activos`} color="#fbbf24" />
          <StatCard label="Conversión Free→Pro" value={`${overview.conversionRate.toFixed(1)}%`} color="#a855f7" />
          <StatCard label="Generaciones totales" value={overview.totalGenerations.toLocaleString('es-ES')} sub={`${thisMonth.generations} este mes`} color="#22c55e" />
        </div>

        {/* Este mes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="soft-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-display font-semibold">Nuevos usuarios este mes</p>
              <Trend current={thisMonth.newUsers} previous={thisMonth.newUsersLastMonth} />
            </div>
            <p className="text-3xl font-display font-bold stat-num" style={{ color: 'var(--red)' }}>{thisMonth.newUsers}</p>
            <p className="text-xs mt-1 font-mono-jb" style={{ color: 'var(--text-faint)' }}>{thisMonth.newUsersLastMonth} el mes pasado</p>
          </div>
          <div className="soft-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-display font-semibold">Generaciones este mes</p>
              <Trend current={thisMonth.generations} previous={thisMonth.generationsLastMonth} />
            </div>
            <p className="text-3xl font-display font-bold stat-num" style={{ color: '#a855f7' }}>{thisMonth.generations}</p>
            <p className="text-xs mt-1 font-mono-jb" style={{ color: 'var(--text-faint)' }}>{thisMonth.generationsLastMonth} el mes pasado</p>
          </div>
        </div>

        {/* Actividad + templates */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="soft-card rounded-2xl p-5 lg:col-span-2">
            <p className="text-sm font-display font-semibold mb-4">Actividad últimos 7 días</p>
            <div className="flex items-end gap-2 h-28">
              {daily.map(d => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-mono-jb" style={{ color: 'var(--text-faint)' }}>{d.count}</span>
                  <div className="w-full rounded-t" style={{ height: `${Math.max((d.count / maxDaily) * 80, d.count > 0 ? 4 : 2)}px`, background: d.count > 0 ? 'var(--red)' : 'var(--line)', opacity: d.count === 0 ? 0.3 : 1 }} />
                  <span className="text-xs font-mono-jb" style={{ color: 'var(--text-faint)' }}>
                    {new Date(d.date).toLocaleDateString('es-ES', { weekday: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="soft-card rounded-2xl p-5">
            <p className="text-sm font-display font-semibold mb-4">Templates este mes</p>
            {templateBreakdown.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-faint)' }}>Sin datos aún</p>
            ) : (
              <div className="space-y-3">
                {templateBreakdown.map(t => {
                  const pct = totalTemplates > 0 ? (t.count / totalTemplates) * 100 : 0;
                  const color = TEMPLATE_COLORS[t.template] ?? '#6b7280';
                  return (
                    <div key={t.template}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-mono-jb" style={{ color }}>{TEMPLATE_LABELS[t.template] ?? t.template}</span>
                        <span className="font-mono-jb" style={{ color: 'var(--text-faint)' }}>{t.count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="w-full rounded-full h-1" style={{ background: 'var(--ink-3)' }}>
                        <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Últimos usuarios + generaciones */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="soft-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-display font-semibold">Últimos registros</p>
              <span className="text-xs font-mono-jb" style={{ color: 'var(--text-faint)' }}>{overview.totalUsers} total</span>
            </div>
            <ul className="space-y-2">
              {recentUsers.map(u => (
                <li key={u.id} className="py-2" style={{ borderBottom: '1px solid var(--line)' }}>
                  {confirmDeleteId === u.id ? (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs" style={{ color: '#f87171' }}>¿Eliminar <strong>{u.email}</strong>?</p>
                      <div className="flex gap-2">
                        <button onClick={() => handleDeleteUser(u.id)} disabled={deleting === u.id}
                          className="text-xs px-3 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                          {deleting === u.id ? '...' : 'Confirmar'}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)}
                          className="text-xs px-3 py-1 rounded-lg" style={{ background: 'var(--ink-3)', border: '1px solid var(--line)', color: 'var(--text-dim)' }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm truncate" style={{ color: 'var(--text)' }}>{u.email}</p>
                        <p className="text-xs font-mono-jb mt-0.5" style={{ color: 'var(--text-faint)' }}>
                          {new Date(u.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })} · {u.generationCount} gen.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {u.isPro
                          ? <span className="text-xs font-mono-jb font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>PRO</span>
                          : <span className="text-xs font-mono-jb px-2 py-0.5 rounded" style={{ background: 'var(--ink-3)', color: 'var(--text-faint)' }}>Free</span>}
                        {u.email !== ADMIN_EMAIL && (
                          <button onClick={() => setConfirmDeleteId(u.id)}
                            className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="soft-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-display font-semibold">Últimas generaciones</p>
              <span className="text-xs font-mono-jb" style={{ color: 'var(--text-faint)' }}>{overview.totalGenerations} total</span>
            </div>
            <ul className="space-y-2">
              {recentGenerations.map(g => (
                <li key={g.id} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--line)' }}>
                  <div className="min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--text)' }}>{g.userEmail}</p>
                    <p className="text-xs font-mono-jb mt-0.5" style={{ color: 'var(--text-faint)' }}>
                      {TEMPLATE_LABELS[g.template] ?? g.template} · {g.tokensUsed} tokens
                    </p>
                  </div>
                  <span className="text-xs font-mono-jb ml-4 shrink-0" style={{ color: 'var(--text-faint)' }}>
                    {new Date(g.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Feedback */}
        <div className="soft-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <p className="text-sm font-display font-semibold">Feedback de usuarios</p>
              <p className="text-xs font-mono-jb mt-0.5" style={{ color: 'var(--text-faint)' }}>Valoraciones post-registro (3 días)</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono-jb">
              {avgRating > 0 && <span style={{ color: 'var(--text-dim)' }}>{avgRating.toFixed(1)} media · {feedbacks.length} recibidos</span>}
              <span style={{ color: '#fbbf24' }}>{feedbackPending} pendientes</span>
            </div>
          </div>
          {feedbacksLoading ? (
            <p className="text-xs font-mono-jb" style={{ color: 'var(--text-faint)' }}>Cargando...</p>
          ) : feedbacks.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>Aún no hay feedback. Los emails se envían a las 19:00 UTC a usuarios con 3+ días.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {feedbacks.map(f => (
                <div key={f.id} className="rounded-xl p-4" style={{ background: 'var(--ink-3)', border: '1px solid var(--line)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <Stars rating={f.rating ?? 0} />
                    <span className="text-xs font-mono-jb uppercase" style={{ color: 'var(--text-faint)' }}>{f.lang}</span>
                  </div>
                  <p className="text-xs leading-relaxed mb-2 min-h-[2rem]" style={{ color: f.comment ? 'var(--text-dim)' : 'var(--text-faint)' }}>
                    {f.comment || <em>Sin comentario</em>}
                  </p>
                  <p className="text-xs font-mono-jb truncate" style={{ color: 'var(--text-faint)' }}>{f.user.email}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reseñas */}
        <div className="soft-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <p className="text-sm font-display font-semibold">Reseñas de usuarios</p>
            <div className="flex gap-3 text-xs font-mono-jb">
              <span style={{ color: '#fbbf24' }}>{reviews.filter(r => r.status === 'pending').length} pendientes</span>
              <span style={{ color: 'var(--line-2)' }}>·</span>
              <span style={{ color: '#22c55e' }}>{reviews.filter(r => r.status === 'approved').length} aprobadas</span>
            </div>
          </div>
          {reviewsLoading ? <p className="text-xs font-mono-jb" style={{ color: 'var(--text-faint)' }}>Cargando...</p> : reviews.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>No hay reseñas aún.</p>
          ) : (
            <ul className="space-y-3">
              {reviews.map(r => (
                <li key={r.id} className="rounded-xl p-4" style={{ background: 'var(--ink-3)', border: '1px solid var(--line)' }}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <Stars rating={r.rating} />
                        <span className="text-xs font-mono-jb truncate" style={{ color: 'var(--text-faint)' }}>{r.user.email}</span>
                        <span className="text-xs font-mono-jb px-2 py-0.5 rounded"
                          style={{ background: r.status === 'approved' ? 'rgba(34,197,94,0.12)' : r.status === 'rejected' ? 'rgba(239,68,68,0.12)' : 'rgba(251,191,36,0.12)', color: r.status === 'approved' ? '#22c55e' : r.status === 'rejected' ? '#f87171' : '#fbbf24' }}>
                          {r.status === 'approved' ? 'Aprobada' : r.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-dim)' }}>{r.text}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {r.status !== 'approved' && (
                        <button onClick={() => handleModerateReview(r.id, 'approved')} disabled={moderating === r.id}
                          className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
                          style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>Aprobar</button>
                      )}
                      {r.status !== 'rejected' && (
                        <button onClick={() => handleModerateReview(r.id, 'rejected')} disabled={moderating === r.id}
                          className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
                          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>Rechazar</button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Gestión manual */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="soft-card rounded-2xl p-5">
            <p className="text-sm font-display font-semibold mb-1">Crear usuario</p>
            <p className="text-xs mb-4 font-mono-jb" style={{ color: 'var(--text-faint)' }}>Registra manualmente una cuenta nueva.</p>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <input type="email" required placeholder="Email" value={createEmail} onChange={e => setCreateEmail(e.target.value)} className="soft-field" />
              <input type="text" placeholder="Nombre (opcional)" value={createName} onChange={e => setCreateName(e.target.value)} className="soft-field" />
              <input type="password" required placeholder="Contraseña" value={createPassword} onChange={e => setCreatePassword(e.target.value)} className="soft-field" />
              <button type="submit" disabled={creating} className="btn-offset w-full py-2.5 text-sm rounded-xl">
                {creating ? 'Creando...' : 'Crear usuario'}
              </button>
              {createMsg && <p className="text-xs font-mono-jb" style={{ color: createMsg.ok ? '#22c55e' : '#f87171' }}>{createMsg.text}</p>}
            </form>
          </div>

          <div className="soft-card rounded-2xl p-5">
            <p className="text-sm font-display font-semibold mb-1">Activar plan Pro</p>
            <p className="text-xs mb-4 font-mono-jb" style={{ color: 'var(--text-faint)' }}>Asigna Pro manualmente sin pasar por Stripe.</p>
            <form onSubmit={handleGrantPro} className="space-y-3">
              <input type="email" required placeholder="Email del usuario" value={grantEmail} onChange={e => setGrantEmail(e.target.value)} className="soft-field" />
              <button type="submit" disabled={granting} className="btn-offset w-full py-2.5 text-sm rounded-xl">
                {granting ? 'Activando...' : 'Activar Pro ★'}
              </button>
              {grantMsg && <p className="text-xs font-mono-jb" style={{ color: grantMsg.ok ? '#22c55e' : '#f87171' }}>{grantMsg.text}</p>}
            </form>
          </div>

          <div className="soft-card rounded-2xl p-5">
            <p className="text-sm font-display font-semibold mb-1">Enviar feedback</p>
            <p className="text-xs mb-4 font-mono-jb" style={{ color: 'var(--text-faint)' }}>Envía el email de valoración a cualquier usuario (ignora el límite de 3 días).</p>
            <form onSubmit={handleSendFeedback} className="space-y-3">
              <input type="email" required placeholder="Email del usuario" value={feedbackEmail} onChange={e => setFeedbackEmail(e.target.value)} className="soft-field" />
              <button type="submit" disabled={sendingFeedback} className="btn-offset w-full py-2.5 text-sm rounded-xl">
                {sendingFeedback ? 'Enviando...' : 'Enviar email de feedback'}
              </button>
              {feedbackSendMsg && <p className="text-xs font-mono-jb" style={{ color: feedbackSendMsg.ok ? '#22c55e' : '#f87171' }}>{feedbackSendMsg.text}</p>}
            </form>
          </div>

        </div>

      </div>

      <footer className="mt-8 py-6" style={{ borderTop: '1px solid var(--line)' }}>
        <p className="text-center text-xs font-mono-jb" style={{ color: 'var(--text-faint)' }}>Panel privado · YTubViral</p>
      </footer>
    </div>
  );
}
