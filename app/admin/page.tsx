'use client';

import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAdminStats } from '@/lib/use-admin-stats';
import { useAdminReviews } from '@/lib/use-admin-reviews';
import { useAdminFeedback } from '@/lib/use-admin-feedback';
import { useAdminReviewModeration } from '@/lib/use-admin-review-moderation';
import { useAdminUserCreation } from '@/lib/use-admin-user-creation';

const TEMPLATE_LABELS: Record<string, string> = {
  title: 'Títulos', description: 'Descripciones', caption: 'Captions',
  thumbnail: 'Thumbnails', script: 'Scripts',
};
const TEMPLATE_COLORS: Record<string, string> = {
  title: '#a855f7', description: '#3b82f6', caption: '#eab308',
  thumbnail: '#ec4899', script: '#22c55e',
};

function Trend({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null;
  const diff = current - previous;
  const pct = Math.round(Math.abs(diff / previous) * 100);
  return (
    <span className="text-[13px] font-mono-jb" style={{ color: diff > 0 ? '#22c55e' : diff < 0 ? '#f87171' : 'var(--text-faint)' }}>
      {diff > 0 ? '↑' : diff < 0 ? '↓' : '—'}{pct}%
    </span>
  );
}

function Stars({ rating }: { rating: number }) {
  return <span className="text-sm">{[1,2,3,4,5].map(s => <span key={s} style={{ opacity: s <= rating ? 1 : 0.15 }}>⭐</span>)}</span>;
}

function StatCard({ label, value, sub, color = 'var(--yv-brand)' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="yv-card p-5">
      <p className="text-2xl font-display font-bold stat-num" style={{ color }}>{value}</p>
      <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>{label}</p>
      {sub && <p className="text-[13px] mt-0.5 font-mono-jb" style={{ color: 'var(--text-faint)' }}>{sub}</p>}
    </div>
  );
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const stats=useAdminStats(session,status);
  const {data,loading,error}=stats;
  const reviewRead=useAdminReviews(session,status);
  const reviews=reviewRead.data?.reviews??[];
  const reviewsLoading=reviewRead.loading;
  const reviewModeration=useAdminReviewModeration(session,status,reviewRead.data,reviewRead.refresh);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const feedbackRead=useAdminFeedback(session,status);
  const feedbacks=feedbackRead.data?.feedbacks??[];
  const feedbacksLoading=feedbackRead.loading;
  const userCreation=useAdminUserCreation(session,status,data,stats.refresh);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantPlan, setGrantPlan] = useState<'pro' | 'business' | 'free'>('pro');
  const [grantDays, setGrantDays] = useState(60);
  const [granting, setGranting] = useState(false);
  const [grantMsg, setGrantMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [feedbackSendMsg, setFeedbackSendMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated' && !(session?.user as { isAdmin?: boolean })?.isAdmin) { router.push('/dashboard'); return; }
  }, [status, session, router]);

  function handleCreateUser(e:React.FormEvent){e.preventDefault();userCreation.create();}

  async function handleSendFeedback(e: React.FormEvent) {
    e.preventDefault(); setSendingFeedback(true); setFeedbackSendMsg(null);
    try {
      const res = await fetch('/api/admin/send-feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: feedbackEmail }) });
      const d = await res.json();
      if (res.status === 200 && d && !Array.isArray(d) && Object.keys(d).length === 2 && d.ok === true && d.status === 'provider-accepted') { setFeedbackSendMsg({ ok: true, text: 'Solicitud de feedback aceptada.' }); }
      else setFeedbackSendMsg({ ok: false, text: d.error ?? 'Error' });
    } catch { setFeedbackSendMsg({ ok: false, text: 'Error de conexión' }); }
    finally { setSendingFeedback(false); }
  }

  async function handleGrantPlan(e: React.FormEvent) {
    e.preventDefault(); setGranting(true); setGrantMsg(null);
    try {
      const res = await fetch('/api/admin/grant-pro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: grantEmail, plan: grantPlan, ...(grantPlan === 'free' ? {} : { durationDays: grantDays }) }) });
      const d = await res.json();
      if (d.ok) {
        const labels: Record<string, string> = { free: 'Free', pro: 'Pro', business: 'Business' };
        setGrantMsg({ ok: true, text: `${labels[d.plan]} activado para ${grantEmail}${d.currentPeriodEnd ? ` hasta ${new Date(d.currentPeriodEnd).toLocaleDateString('es-ES')}` : ''}.` });
        setGrantEmail('');
        stats.refresh();
      }
      else setGrantMsg({ ok: false, text: d.error ?? 'Error' });
    } catch { setGrantMsg({ ok: false, text: 'Error de conexión' }); }
    finally { setGranting(false); }
  }

  async function handleDeleteUser(userId: string) {
    setDeleting(userId);
    try {
      const res = await fetch('/api/admin/delete-user', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
      const result = await res.json();
      if (result.error) { alert(result.error); return; }
      stats.refresh();
    } catch { alert('Error al eliminar'); }
    finally { setDeleting(null); setConfirmDeleteId(null); }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen grid-bg grain flex items-center justify-center" style={{ background: 'var(--ink)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: 'var(--yv-brand)' }} />
          <p className="text-[13px] font-mono-jb" style={{ color: 'var(--text-faint)' }}>Cargando panel...</p>
        </div>
      </div>
    );
  }

  if (error) return <DashboardShell><div role="alert" className="p-6"><p>{error}</p><button type="button" onClick={stats.refresh}>Actualizar estadísticas</button></div></DashboardShell>;
  if (!data) return null;

  const { overview, thisMonth, templateBreakdown, daily, recentUsers, recentGenerations } = data;
  const maxDaily = Math.max(...daily.map(d => d.count), 1);
  const totalTemplates = templateBreakdown.reduce((s, t) => s + t.count, 0);
  const ratings=feedbacks.flatMap(f=>f.rating===null?[]:[f.rating]);
  const avgRating=ratings.length>0?ratings.reduce((sum,rating)=>sum+rating,0)/ratings.length:null;

  return (
    <DashboardShell>

      {/* data-clarity-mask: el panel pinta emails y nombres de TODOS los usuarios.
          El consentimiento de cookies que da el admin no cubre subir a Microsoft los
          datos personales de terceros, así que este árbol nunca se graba, sea cual sea
          el modo de enmascarado del panel de Clarity (el atributo lo sobreescribe). */}
      <div className="yv-page yv-page--wide space-y-8" data-clarity-mask="true">

        {/* Header + exports */}
        <div className="yv-page-header">
          <div className="yv-page-header__left">
            <h1 className="yv-page-header__title">Panel de administración</h1>
            <p className="yv-page-header__desc">Agregados almacenados. Frescura sin confirmar; conciliación no evaluada.</p>
          </div>
          <div className="yv-page-header__actions flex-wrap">
            <a href="/admin/ai-configuration" className="rounded-lg border px-4 py-2 text-sm">Perfiles de IA</a>
            <a href="/admin/affiliates" className="text-[13px] font-mono-jb px-3 py-2 rounded-lg transition"
              style={{ background: 'var(--ink-3)', border: '1px solid var(--line-2)', color: 'var(--text-dim)' }}>
              Afiliados
            </a>
            {[{ type: 'users', label: 'Usuarios' }, { type: 'generations', label: 'Generaciones' }, { type: 'subscriptions', label: 'Suscripciones' }].map(({ type, label }) => (
              <a key={type} href={`/api/admin/export?type=${type}`}
                className="text-[13px] font-mono-jb px-3 py-2 rounded-lg transition"
                style={{ background: 'var(--ink-3)', border: '1px solid var(--line-2)', color: 'var(--text-dim)' }}>
                ↓ CSV {label}
              </a>
            ))}
          </div>
        </div>

        <button type="button" onClick={stats.refresh}>Actualizar estadísticas</button>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Usuarios totales" value={overview.totalUsers} sub={`${overview.freeUsers} free · ${overview.proUsers} pro`} />
          <StatCard label="MRR estimado" value={`${overview.mrr.toFixed(2).replace('.', ',')}€`} sub="Estimación con precios fijos; sin conciliación de cobros" color="#fbbf24" />
          <StatCard label="Conversión Free→Pro" value={`${overview.conversionRate.toFixed(1)}%`} color="#a855f7" />
          <StatCard label="Generaciones totales" value={overview.totalGenerations.toLocaleString('es-ES')} sub={`${thisMonth.generations} este mes`} color="#22c55e" />
        </div>

        {/* Este mes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="yv-card p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-display font-semibold">Nuevos usuarios este mes</p>
              <Trend current={thisMonth.newUsers} previous={thisMonth.newUsersLastMonth} />
            </div>
            <p className="text-3xl font-display font-bold stat-num" style={{ color: 'var(--yv-brand)' }}>{thisMonth.newUsers}</p>
            <p className="text-[13px] mt-1 font-mono-jb" style={{ color: 'var(--text-faint)' }}>{thisMonth.newUsersLastMonth} el mes pasado</p>
          </div>
          <div className="yv-card p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-display font-semibold">Generaciones este mes</p>
              <Trend current={thisMonth.generations} previous={thisMonth.generationsLastMonth} />
            </div>
            <p className="text-3xl font-display font-bold stat-num" style={{ color: '#a855f7' }}>{thisMonth.generations}</p>
            <p className="text-[13px] mt-1 font-mono-jb" style={{ color: 'var(--text-faint)' }}>{thisMonth.generationsLastMonth} el mes pasado</p>
          </div>
        </div>

        {/* Actividad + templates */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="yv-card p-5 lg:col-span-2">
            <p className="text-sm font-display font-semibold mb-4">Actividad últimos 7 días</p>
            <div className="flex items-end gap-2 h-28">
              {daily.map(d => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[13px] font-mono-jb" style={{ color: 'var(--text-faint)' }}>{d.count}</span>
                  <div className="w-full rounded-t" style={{ height: `${Math.max((d.count / maxDaily) * 80, d.count > 0 ? 4 : 2)}px`, background: d.count > 0 ? 'var(--yv-brand)' : 'var(--line)', opacity: d.count === 0 ? 0.3 : 1 }} />
                  <span className="text-[13px] font-mono-jb" style={{ color: 'var(--text-faint)' }}>
                    {new Date(d.date).toLocaleDateString('es-ES', { weekday: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="yv-card p-5">
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
                      <div className="flex justify-between text-[13px] mb-1">
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
          <div className="yv-card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-display font-semibold">Últimos registros</p>
              <span className="text-[13px] font-mono-jb" style={{ color: 'var(--text-faint)' }}>{overview.totalUsers} total</span>
            </div>
            <ul className="space-y-2">
              {recentUsers.map(u => (
                <li key={u.id} className="py-2" style={{ borderBottom: '1px solid var(--line)' }}>
                  {confirmDeleteId === u.id ? (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-[13px]" style={{ color: '#f87171' }}>¿Eliminar <strong>{u.email}</strong>?</p>
                      <div className="flex gap-2">
                        <button onClick={() => handleDeleteUser(u.id)} disabled={deleting === u.id}
                          className="text-[13px] px-3 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                          {deleting === u.id ? '...' : 'Confirmar'}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)}
                          className="text-[13px] px-3 py-1 rounded-lg" style={{ background: 'var(--ink-3)', border: '1px solid var(--line)', color: 'var(--text-dim)' }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm truncate" style={{ color: 'var(--text)' }}>{u.email}</p>
                        <p className="text-[13px] font-mono-jb mt-0.5" style={{ color: 'var(--text-faint)' }}>
                          {new Date(u.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })} · {u.generationCount} gen.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {u.plan === 'business'
                          ? <span className="text-[13px] font-mono-jb font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(0,229,255,0.15)', color: '#00E5FF' }}>BIZ</span>
                          : u.plan === 'pro'
                          ? <span className="text-[13px] font-mono-jb font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>PRO</span>
                          : <span className="text-[13px] font-mono-jb px-2 py-0.5 rounded" style={{ background: 'var(--ink-3)', color: 'var(--text-faint)' }}>Free</span>}
                        {u.email !== session?.user?.email && (
                          <button onClick={() => setConfirmDeleteId(u.id)}
                            className="text-[13px] px-2 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
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

          <div className="yv-card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-display font-semibold">Últimas generaciones</p>
              <span className="text-[13px] font-mono-jb" style={{ color: 'var(--text-faint)' }}>{overview.totalGenerations} total</span>
            </div>
            <ul className="space-y-2">
              {recentGenerations.map(g => (
                <li key={g.id} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--line)' }}>
                  <div className="min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--text)' }}>{g.userEmail}</p>
                    <p className="text-[13px] font-mono-jb mt-0.5" style={{ color: 'var(--text-faint)' }}>
                      {TEMPLATE_LABELS[g.template] ?? g.template} · {g.tokensUsed == null ? 'Consumo no disponible' : `${g.tokensUsed} tokens`}
                    </p>
                  </div>
                  <span className="text-[13px] font-mono-jb ml-4 shrink-0" style={{ color: 'var(--text-faint)' }}>
                    {new Date(g.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Feedback */}
        <div className="yv-card p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <p className="text-sm font-display font-semibold">Feedback de usuarios</p>
              <p className="text-[13px] font-mono-jb mt-0.5" style={{ color: 'var(--text-faint)' }}>Hasta 50 respuestas enviadas. Frescura sin confirmar; pendientes consultados por separado.</p>
            </div>
            <div className="flex items-center gap-4 text-[13px] font-mono-jb">
              <button type="button" onClick={feedbackRead.refresh} disabled={feedbacksLoading}
                className="text-[13px] px-3 py-1.5 rounded-lg disabled:opacity-50">Actualizar feedback</button>
              {feedbackRead.data && <span style={{ color: 'var(--text-dim)' }}>{feedbacks.length} respuestas · {feedbackRead.data.pending} pendientes</span>}
              {avgRating!==null && <span style={{ color: 'var(--text-dim)' }}>{avgRating.toFixed(1)} media · {ratings.length} valoraciones</span>}
            </div>
          </div>
          {feedbacksLoading ? (
            <p className="text-[13px] font-mono-jb" style={{ color: 'var(--text-faint)' }}>Cargando...</p>
          ) : feedbackRead.error ? (
            <p role="alert" className="text-sm" style={{ color: 'var(--text-faint)' }}>{feedbackRead.error}</p>
          ) : feedbacks.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>No hay respuestas enviadas en esta consulta.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {feedbacks.map(f => (
                <div key={f.id} className="rounded-xl p-4" style={{ background: 'var(--ink-3)', border: '1px solid var(--line)' }}>
                  <div className="flex items-center justify-between mb-2">
                    {f.rating===null ? <span className="text-[13px]" style={{ color: 'var(--text-faint)' }}>Sin valoración</span> : <Stars rating={f.rating} />}
                    <span className="text-[13px] font-mono-jb uppercase" style={{ color: 'var(--text-faint)' }}>{f.lang}</span>
                  </div>
                  <p className="text-[13px] leading-relaxed mb-2 min-h-[2rem]" style={{ color: f.comment ? 'var(--text-dim)' : 'var(--text-faint)' }}>
                    {f.comment || <em>Sin comentario</em>}
                  </p>
                  <p className="text-[13px] font-mono-jb truncate" style={{ color: 'var(--text-faint)' }}>{f.user.email}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reseñas */}
        <div className="yv-card p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <p className="text-sm font-display font-semibold">Reseñas de usuarios</p>
            <button type="button" onClick={reviewRead.refresh} disabled={reviewsLoading}
              className="text-[13px] px-3 py-1.5 rounded-lg disabled:opacity-50">Actualizar reseñas</button>
            <div className="flex gap-3 text-[13px] font-mono-jb">
              <span style={{ color: '#fbbf24' }}>{reviews.filter(r => r.status === 'pending').length} pendientes</span>
              <span style={{ color: 'var(--line-2)' }}>·</span>
              <span style={{ color: '#22c55e' }}>{reviews.filter(r => r.status === 'approved').length} aprobadas</span>
            </div>
          </div>
          <p className="text-[13px] mb-3" style={{ color: 'var(--text-faint)' }}>Una reseña moderada no puede cambiarse desde esta vista.</p>
          {reviewModeration.message && <p role="status" className="text-sm mb-3">{reviewModeration.message}</p>}
          {reviewsLoading ? <p className="text-[13px] font-mono-jb" style={{ color: 'var(--text-faint)' }}>Cargando...</p> : reviewRead.error ? (
            <p role="alert" className="text-sm" style={{ color: 'var(--text-faint)' }}>{reviewRead.error}</p>
          ) : reviews.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>No hay reseñas aún.</p>
          ) : (
            <ul className="space-y-3">
              {reviews.map(r => (
                <li key={r.id} className="rounded-xl p-4" style={{ background: 'var(--ink-3)', border: '1px solid var(--line)' }}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <Stars rating={r.rating} />
                        <span className="text-[13px] font-mono-jb truncate" style={{ color: 'var(--text-faint)' }}>{r.user.email}</span>
                        <span className="text-[13px] font-mono-jb px-2 py-0.5 rounded"
                          style={{ background: r.status === 'approved' ? 'rgba(34,197,94,0.12)' : r.status === 'rejected' ? 'rgba(239,68,68,0.12)' : 'rgba(251,191,36,0.12)', color: r.status === 'approved' ? '#22c55e' : r.status === 'rejected' ? '#f87171' : '#fbbf24' }}>
                          {r.status === 'approved' ? 'Aprobada' : r.status === 'rejected' ? 'Rechazada' : r.status === 'pending' ? 'Pendiente' : r.status}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-dim)' }}>{r.text}</p>
                    </div>
                    <div className="flex gap-2 shrink-0" aria-busy={reviewModeration.pendingId===r.id}>
                      {r.status === 'pending' && (
                        <button type="button" onClick={() => reviewModeration.moderate(r.id, 'approved')} disabled={!reviewModeration.canModerate(r.id)}
                          className="text-[13px] px-3 py-1.5 rounded-lg disabled:opacity-50"
                          style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>Aprobar</button>
                      )}
                      {r.status === 'pending' && (
                        <button type="button" onClick={() => reviewModeration.moderate(r.id, 'rejected')} disabled={!reviewModeration.canModerate(r.id)}
                          className="text-[13px] px-3 py-1.5 rounded-lg disabled:opacity-50"
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
          <div className="yv-card p-5">
            <p className="text-sm font-display font-semibold mb-1">Crear usuario</p>
            <p className="text-[13px] mb-4 font-mono-jb" style={{ color: 'var(--text-faint)' }}>Registra manualmente una cuenta nueva.</p>
            <form onSubmit={handleCreateUser} className="space-y-3" aria-busy={userCreation.creating}>
              <input type="email" required placeholder="Email" maxLength={254} value={userCreation.form.email} onChange={e => userCreation.change('email',e.target.value)} className="soft-field" />
              <input type="text" placeholder="Nombre (opcional)" maxLength={200} value={userCreation.form.name} onChange={e => userCreation.change('name',e.target.value)} className="soft-field" />
              <input type="password" required placeholder="Contraseña" autoComplete="new-password" minLength={8} value={userCreation.form.password} onChange={e => userCreation.change('password',e.target.value)} className="soft-field" />
              <button type="submit" disabled={!userCreation.canCreate} className="btn-offset w-full py-2.5 text-sm rounded-xl">
                {userCreation.creating ? 'Creando...' : 'Crear usuario'}
              </button>
              {userCreation.message && <p role="status" className="text-[13px] font-mono-jb" style={{ color: userCreation.confirmed ? '#22c55e' : '#f87171' }}>{userCreation.message}</p>}
            </form>
          </div>

          <div className="yv-card p-5">
            <p className="text-sm font-display font-semibold mb-1">Gestionar plan</p>
            <p className="text-[13px] mb-4 font-mono-jb" style={{ color: 'var(--text-faint)' }}>Asigna Free, Pro o Business manualmente.</p>
            <form onSubmit={handleGrantPlan} className="space-y-3">
              <input type="email" required placeholder="Email del usuario" value={grantEmail} onChange={e => setGrantEmail(e.target.value)} className="soft-field" />
              <div className="flex gap-2">
                {(['free', 'pro', 'business'] as const).map(p => {
                  const colors: Record<string, { bg: string; border: string; color: string }> = {
                    free: { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.12)', color: 'var(--text-dim)' },
                    pro: { bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)', color: '#fbbf24' },
                    business: { bg: 'rgba(0,229,255,0.1)', border: 'rgba(0,229,255,0.3)', color: '#00E5FF' },
                  };
                  const c = grantPlan === p ? colors[p] : { bg: 'transparent', border: 'var(--line)', color: 'var(--text-faint)' };
                  return (
                    <button key={p} type="button" onClick={() => setGrantPlan(p)}
                      className="flex-1 text-[13px] font-mono-jb font-bold py-2 rounded-lg transition"
                      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
                      {p === 'free' ? 'Free' : p === 'pro' ? 'Pro' : 'Business'}
                    </button>
                  );
                })}
              </div>
              {grantPlan !== 'free' && <label className="block text-[13px] font-mono-jb" style={{ color: 'var(--text-faint)' }}>
                Duración en días (1–365)
                <input type="number" required min={1} max={365} step={1} value={grantDays} onChange={e => setGrantDays(Number(e.target.value))} className="soft-field mt-1" />
              </label>}
              <button type="submit" disabled={granting} className="btn-offset w-full py-2.5 text-sm rounded-xl">
                {granting ? 'Aplicando...' : grantPlan === 'free' ? 'Quitar plan pagado' : `Activar ${grantPlan === 'pro' ? 'Pro ★' : 'Business ◆'}`}
              </button>
              {grantMsg && <p className="text-[13px] font-mono-jb" style={{ color: grantMsg.ok ? '#22c55e' : '#f87171' }}>{grantMsg.text}</p>}
            </form>
          </div>

          <div className="yv-card p-5">
            <p className="text-sm font-display font-semibold mb-1">Enviar feedback</p>
            <p className="text-[13px] mb-4 font-mono-jb" style={{ color: 'var(--text-faint)' }}>Envía el email de valoración a cualquier usuario (ignora el límite de 3 días).</p>
            <form onSubmit={handleSendFeedback} className="space-y-3">
              <input type="email" required placeholder="Email del usuario" value={feedbackEmail} onChange={e => setFeedbackEmail(e.target.value)} className="soft-field" />
              <button type="submit" disabled={sendingFeedback} className="btn-offset w-full py-2.5 text-sm rounded-xl">
                {sendingFeedback ? 'Enviando...' : 'Enviar email de feedback'}
              </button>
              {feedbackSendMsg && <p className="text-[13px] font-mono-jb" style={{ color: feedbackSendMsg.ok ? '#22c55e' : '#f87171' }}>{feedbackSendMsg.text}</p>}
            </form>
          </div>

        </div>

      </div>

      <footer className="mt-8 py-6" style={{ borderTop: '1px solid var(--line)' }}>
        <p className="text-center text-[13px] font-mono-jb" style={{ color: 'var(--text-faint)' }}>Panel privado · YTubViral</p>
      </footer>
    </DashboardShell>
  );
}
