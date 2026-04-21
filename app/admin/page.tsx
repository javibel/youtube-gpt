'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FaUsers, FaCrown, FaChartBar, FaBolt, FaArrowUp, FaArrowDown, FaMinus, FaStar } from 'react-icons/fa';

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? '';

const TEMPLATE_LABELS: Record<string, string> = {
  title: 'Títulos',
  description: 'Descripciones',
  caption: 'Captions',
  thumbnail: 'Thumbnails',
  script: 'Scripts',
};

const TEMPLATE_COLORS: Record<string, string> = {
  title: '#a855f7',
  description: '#3b82f6',
  caption: '#eab308',
  thumbnail: '#ec4899',
  script: '#22c55e',
};

type AdminData = {
  overview: {
    totalUsers: number;
    proUsers: number;
    freeUsers: number;
    mrr: number;
    conversionRate: number;
    totalGenerations: number;
  };
  thisMonth: {
    newUsers: number;
    newUsersLastMonth: number;
    generations: number;
    generationsLastMonth: number;
  };
  templateBreakdown: { template: string; count: number }[];
  daily: { date: string; count: number }[];
  recentUsers: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
    isPro: boolean;
    generationCount: number;
  }[];
  recentGenerations: {
    id: string;
    template: string;
    createdAt: string;
    tokensUsed: number;
    userEmail: string;
  }[];
};

function Trend({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null;
  const diff = current - previous;
  const pct = Math.round(Math.abs(diff / previous) * 100);
  if (diff > 0) return <span className="text-xs flex items-center gap-0.5" style={{ color: '#4ade80' }}><FaArrowUp size={9} />{pct}%</span>;
  if (diff < 0) return <span className="text-xs flex items-center gap-0.5" style={{ color: '#f87171' }}><FaArrowDown size={9} />{pct}%</span>;
  return <span className="text-xs flex items-center gap-0.5 text-gray-600"><FaMinus size={9} />0%</span>;
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

  // Create user
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Grant Pro
  const [grantEmail, setGrantEmail] = useState('');
  const [granting, setGranting] = useState(false);
  const [grantMsg, setGrantMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated' && session?.user?.email !== ADMIN_EMAIL) {
      router.push('/dashboard');
      return;
    }
    if (status === 'authenticated') {
      fetch('/api/admin/stats')
        .then((r) => r.json())
        .then((d) => {
          if (d.error) { setError(d.error); return; }
          setData(d);
        })
        .finally(() => setLoading(false));
      fetch('/api/admin/reviews')
        .then((r) => r.json())
        .then((d) => { if (d.reviews) setReviews(d.reviews); })
        .finally(() => setReviewsLoading(false));
    }
  }, [status, session, router]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateMsg(null);
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: createEmail, name: createName, password: createPassword }),
      });
      const d = await res.json();
      if (d.ok) {
        setCreateMsg({ ok: true, text: `Usuario ${d.user.email} creado correctamente.` });
        setCreateEmail(''); setCreateName(''); setCreatePassword('');
        // Refrescar lista
        fetch('/api/admin/stats').then((r) => r.json()).then((d) => { if (!d.error) setData(d); });
      } else {
        setCreateMsg({ ok: false, text: d.error ?? 'Error al crear usuario' });
      }
    } catch {
      setCreateMsg({ ok: false, text: 'Error de conexión' });
    } finally {
      setCreating(false);
    }
  }

  async function handleGrantPro(e: React.FormEvent) {
    e.preventDefault();
    setGranting(true);
    setGrantMsg(null);
    try {
      const res = await fetch('/api/admin/grant-pro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: grantEmail }),
      });
      const d = await res.json();
      if (d.ok) {
        setGrantMsg({ ok: true, text: `Plan Pro activado para ${grantEmail}.` });
        setGrantEmail('');
        fetch('/api/admin/stats').then((r) => r.json()).then((d) => { if (!d.error) setData(d); });
      } else {
        setGrantMsg({ ok: false, text: d.error ?? 'Error al activar Pro' });
      }
    } catch {
      setGrantMsg({ ok: false, text: 'Error de conexión' });
    } finally {
      setGranting(false);
    }
  }

  async function handleModerateReview(id: string, status: 'approved' | 'rejected') {
    setModerating(id);
    try {
      const res = await fetch('/api/admin/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const d = await res.json();
      if (d.ok) {
        setReviews((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
      }
    } finally {
      setModerating(null);
    }
  }

  async function handleDeleteUser(userId: string) {
    setDeleting(userId);
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const result = await res.json();
      if (result.error) { alert(result.error); return; }
      // Eliminar de la lista local
      setData((prev) => prev ? {
        ...prev,
        recentUsers: prev.recentUsers.filter((u) => u.id !== userId),
        overview: { ...prev.overview, totalUsers: prev.overview.totalUsers - 1 },
      } : prev);
    } catch {
      alert('Error al eliminar el usuario');
    } finally {
      setDeleting(null);
      setConfirmDeleteId(null);
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#06060f url("/bg.png") center/cover no-repeat fixed' }}>
        <div className="fixed inset-0" style={{ background: 'rgba(6,6,15,0.7)' }} />
        <div className="relative flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border border-transparent animate-spin" style={{ borderTopColor: '#00D9FF', boxShadow: '0 0 12px rgba(0,217,255,0.4)' }} />
          <p className="text-gray-500 text-sm">Cargando panel...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#06060f' }}>
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { overview, thisMonth, templateBreakdown, daily, recentUsers, recentGenerations } = data;
  const maxDaily = Math.max(...daily.map((d) => d.count), 1);
  const totalTemplates = templateBreakdown.reduce((s, t) => s + t.count, 0);

  return (
    <div className="min-h-screen text-white relative overflow-x-hidden" style={{ background: '#06060f url("/bg.png") center/cover no-repeat fixed' }}>

      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-15%', left: '-10%', width: '700px', height: '700px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,217,255,0.2) 0%, transparent 65%)', filter: 'blur(20px)' }} />
        <div style={{ position: 'absolute', top: '20%', right: '-15%', width: '800px', height: '800px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(180,0,255,0.15) 0%, transparent 65%)', filter: 'blur(20px)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(6,6,15,0.55)' }} />
      </div>

      <div className="relative" style={{ zIndex: 1 }}>

        {/* Header */}
        <header className="sticky top-0 z-50 px-6 py-4 backdrop-blur-xl" style={{ borderBottom: '1px solid rgba(0,217,255,0.08)', background: 'rgba(6,6,15,0.85)' }}>
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3">
              <a href="/" className="text-xl font-bold gradient-text">YTubViral.com</a>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,217,255,0.1)', border: '1px solid rgba(0,217,255,0.3)', color: '#00D9FF' }}>ADMIN</span>
            </div>
            <div className="flex items-center gap-4">
              <a href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm transition">Mi cuenta</a>
              <button onClick={() => signOut({ callbackUrl: '/' })} className="text-gray-600 hover:text-gray-300 text-sm transition">Salir</button>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">Panel de administración</h1>
              <p className="text-gray-500 text-sm mt-1">Métricas en tiempo real de YTubViral</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { type: 'users', label: 'Usuarios' },
                { type: 'generations', label: 'Generaciones' },
                { type: 'subscriptions', label: 'Suscripciones' },
              ].map(({ type, label }) => (
                <a
                  key={type}
                  href={`/api/admin/export?type=${type}`}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition"
                  style={{ background: 'rgba(0,217,255,0.08)', border: '1px solid rgba(0,217,255,0.2)', color: '#00D9FF' }}
                >
                  ↓ CSV {label}
                </a>
              ))}
            </div>
          </div>

          {/* Overview cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'Usuarios totales',
                value: overview.totalUsers,
                sub: `${overview.freeUsers} free · ${overview.proUsers} pro`,
                icon: <FaUsers size={16} />,
                color: '#00D9FF',
              },
              {
                label: 'MRR',
                value: `${overview.mrr.toFixed(2).replace('.', ',')}€`,
                sub: `${overview.proUsers} suscriptores Pro`,
                icon: <FaCrown size={16} />,
                color: '#f97316',
              },
              {
                label: 'Conversión',
                value: `${overview.conversionRate.toFixed(1)}%`,
                sub: 'Free → Pro',
                icon: <FaArrowUp size={16} />,
                color: '#a855f7',
              },
              {
                label: 'Generaciones totales',
                value: overview.totalGenerations.toLocaleString('es-ES'),
                sub: `${thisMonth.generations} este mes`,
                icon: <FaBolt size={16} />,
                color: '#00D9FF',
              },
            ].map((card, i) => (
              <div key={i} className="neon-card rounded-2xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${card.color}18`, color: card.color }}>
                    {card.icon}
                  </div>
                </div>
                <p className="text-2xl font-bold text-white">{card.value}</p>
                <p className="text-gray-500 text-xs mt-0.5">{card.label}</p>
                <p className="text-gray-600 text-xs mt-1">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Este mes vs mes pasado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="neon-card rounded-2xl p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-white">Nuevos usuarios este mes</p>
                <Trend current={thisMonth.newUsers} previous={thisMonth.newUsersLastMonth} />
              </div>
              <p className="text-3xl font-bold" style={{ color: '#00D9FF' }}>{thisMonth.newUsers}</p>
              <p className="text-gray-600 text-xs mt-1">{thisMonth.newUsersLastMonth} el mes pasado</p>
            </div>
            <div className="neon-card rounded-2xl p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-white">Generaciones este mes</p>
                <Trend current={thisMonth.generations} previous={thisMonth.generationsLastMonth} />
              </div>
              <p className="text-3xl font-bold" style={{ color: '#CC00FF' }}>{thisMonth.generations}</p>
              <p className="text-gray-600 text-xs mt-1">{thisMonth.generationsLastMonth} el mes pasado</p>
            </div>
          </div>

          {/* Gráfica de actividad + templates */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Actividad últimos 7 días */}
            <div className="neon-card rounded-2xl p-5 lg:col-span-2">
              <p className="text-sm font-semibold text-white mb-4">Actividad últimos 7 días</p>
              <div className="flex items-end gap-2 h-28">
                {daily.map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-600">{d.count}</span>
                    <div
                      className="w-full rounded-t-md transition-all"
                      style={{
                        height: `${Math.max((d.count / maxDaily) * 80, d.count > 0 ? 4 : 2)}px`,
                        background: 'linear-gradient(180deg,#00D9FF,#CC00FF)',
                        opacity: d.count === 0 ? 0.15 : 1,
                      }}
                    />
                    <span className="text-xs text-gray-700">
                      {new Date(d.date).toLocaleDateString('es-ES', { weekday: 'short' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Templates más usados */}
            <div className="neon-card rounded-2xl p-5">
              <p className="text-sm font-semibold text-white mb-4">Templates este mes</p>
              {templateBreakdown.length === 0 ? (
                <p className="text-gray-600 text-sm">Sin datos aún</p>
              ) : (
                <div className="space-y-3">
                  {templateBreakdown.map((t) => {
                    const pct = totalTemplates > 0 ? (t.count / totalTemplates) * 100 : 0;
                    const color = TEMPLATE_COLORS[t.template] ?? '#6b7280';
                    return (
                      <div key={t.template}>
                        <div className="flex justify-between text-xs mb-1">
                          <span style={{ color }}>{TEMPLATE_LABELS[t.template] ?? t.template}</span>
                          <span className="text-gray-500">{t.count} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full rounded-full h-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Últimos usuarios + últimas generaciones */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Últimos usuarios */}
            <div className="neon-card rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-white">Últimos registros</p>
                <span className="text-xs text-gray-600">{overview.totalUsers} total</span>
              </div>
              <ul className="space-y-2">
                {recentUsers.map((u) => (
                  <li key={u.id} className="py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {confirmDeleteId === u.id ? (
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-red-400">¿Eliminar <strong>{u.email}</strong>? Esta acción es irreversible.</p>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            disabled={deleting === u.id}
                            className="text-xs font-bold px-3 py-1 rounded-lg transition"
                            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171' }}
                          >
                            {deleting === u.id ? '...' : 'Sí, eliminar'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs px-3 py-1 rounded-lg transition"
                            style={{ background: 'rgba(255,255,255,0.05)', color: '#6b7280' }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white truncate max-w-[180px]">{u.email}</p>
                          <p className="text-xs text-gray-600">
                            {new Date(u.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {' · '}{u.generationCount} gen.
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {u.isPro ? (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'linear-gradient(135deg,#fbbf24,#f97316)', color: '#000' }}>PRO</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: '#6b7280' }}>Free</span>
                          )}
                          {u.email !== ADMIN_EMAIL && (
                            <button
                              onClick={() => setConfirmDeleteId(u.id)}
                              className="text-xs px-2 py-1 rounded-lg transition"
                              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
                            >
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

            {/* Últimas generaciones */}
            <div className="neon-card rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-white">Últimas generaciones</p>
                <span className="text-xs text-gray-600">{overview.totalGenerations} total</span>
              </div>
              <ul className="space-y-2">
                {recentGenerations.map((g) => (
                  <li key={g.id} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div>
                      <p className="text-sm text-white truncate max-w-[180px]">{g.userEmail}</p>
                      <p className="text-xs text-gray-600">
                        {TEMPLATE_LABELS[g.template] ?? g.template}
                        {' · '}{g.tokensUsed} tokens
                      </p>
                    </div>
                    <span className="text-xs text-gray-600 shrink-0">
                      {new Date(g.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Reseñas */}
          <div className="neon-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-white">Reseñas de usuarios</p>
              <div className="flex gap-2 text-xs text-gray-600">
                <span style={{ color: '#facc15' }}>{reviews.filter((r) => r.status === 'pending').length} pendientes</span>
                <span>·</span>
                <span style={{ color: '#4ade80' }}>{reviews.filter((r) => r.status === 'approved').length} aprobadas</span>
              </div>
            </div>
            {reviewsLoading ? (
              <p className="text-gray-600 text-sm">Cargando reseñas...</p>
            ) : reviews.length === 0 ? (
              <p className="text-gray-600 text-sm">No hay reseñas aún.</p>
            ) : (
              <ul className="space-y-3">
                {reviews.map((r) => (
                  <li key={r.id} className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <FaStar key={s} size={11} style={{ color: s <= r.rating ? '#facc15' : 'rgba(255,255,255,0.15)' }} />
                            ))}
                          </div>
                          <span className="text-xs text-gray-500 truncate">{r.user.email}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${r.status === 'approved' ? '' : r.status === 'rejected' ? '' : ''}`}
                            style={{
                              background: r.status === 'approved' ? 'rgba(74,222,128,0.1)' : r.status === 'rejected' ? 'rgba(248,113,113,0.1)' : 'rgba(250,204,21,0.1)',
                              color: r.status === 'approved' ? '#4ade80' : r.status === 'rejected' ? '#f87171' : '#facc15',
                              border: `1px solid ${r.status === 'approved' ? 'rgba(74,222,128,0.3)' : r.status === 'rejected' ? 'rgba(248,113,113,0.3)' : 'rgba(250,204,21,0.3)'}`,
                            }}
                          >
                            {r.status === 'approved' ? 'Aprobada' : r.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
                          </span>
                        </div>
                        <p className="text-gray-300 text-sm leading-relaxed">{r.text}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {r.status !== 'approved' && (
                          <button
                            onClick={() => handleModerateReview(r.id, 'approved')}
                            disabled={moderating === r.id}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                            style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }}
                          >
                            Aprobar
                          </button>
                        )}
                        {r.status !== 'rejected' && (
                          <button
                            onClick={() => handleModerateReview(r.id, 'rejected')}
                            disabled={moderating === r.id}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                            style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}
                          >
                            Rechazar
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>

          {/* Gestión manual */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Crear usuario */}
            <div className="neon-card rounded-2xl p-5">
              <p className="text-sm font-semibold text-white mb-1">Crear usuario</p>
              <p className="text-xs text-gray-600 mb-4">Registra manualmente una cuenta nueva.</p>
              <form onSubmit={handleCreateUser} className="space-y-3">
                <input
                  type="email" required placeholder="Email" value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-white/30"
                />
                <input
                  type="text" placeholder="Nombre (opcional)" value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-white/30"
                />
                <input
                  type="password" required placeholder="Contraseña" value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-white/30"
                />
                <button type="submit" disabled={creating}
                  className="w-full text-sm font-semibold py-2 rounded-lg transition disabled:opacity-50"
                  style={{ background: 'rgba(0,217,255,0.1)', border: '1px solid rgba(0,217,255,0.3)', color: '#00D9FF' }}>
                  {creating ? 'Creando...' : 'Crear usuario'}
                </button>
                {createMsg && (
                  <p className="text-xs" style={{ color: createMsg.ok ? '#4ade80' : '#f87171' }}>{createMsg.text}</p>
                )}
              </form>
            </div>

            {/* Dar Pro */}
            <div className="neon-card rounded-2xl p-5">
              <p className="text-sm font-semibold text-white mb-1">Activar plan Pro</p>
              <p className="text-xs text-gray-600 mb-4">Asigna Pro manualmente a un usuario existente (sin pasar por Stripe).</p>
              <form onSubmit={handleGrantPro} className="space-y-3">
                <input
                  type="email" required placeholder="Email del usuario" value={grantEmail}
                  onChange={(e) => setGrantEmail(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-white/30"
                />
                <button type="submit" disabled={granting}
                  className="w-full text-sm font-semibold py-2 rounded-lg transition disabled:opacity-50"
                  style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', color: '#fb923c' }}>
                  {granting ? 'Activando...' : 'Activar Pro ★'}
                </button>
                {grantMsg && (
                  <p className="text-xs" style={{ color: grantMsg.ok ? '#4ade80' : '#f87171' }}>{grantMsg.text}</p>
                )}
              </form>
            </div>

          </div>

        {/* Footer */}
        <footer className="px-6 py-6 mt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="max-w-7xl mx-auto flex justify-center">
            <p className="text-xs text-gray-700">Panel privado · YTubViral Admin</p>
          </div>
        </footer>

      </div>
    </div>
  );
}
