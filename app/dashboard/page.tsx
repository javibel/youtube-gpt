'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FaBolt, FaChartBar, FaClock, FaCheckCircle, FaCrown, FaPenFancy } from 'react-icons/fa';

const TEMPLATE_LABELS: Record<string, string> = {
  titles: 'Títulos',
  descriptions: 'Descripciones',
  captions: 'Captions',
  thumbnails: 'Thumbnails',
  scripts: 'Scripts',
};

const TEMPLATE_ICONS: Record<string, string> = {
  titles: '🎯',
  descriptions: '📄',
  captions: '💬',
  thumbnails: '🖼️',
  scripts: '📝',
};

type Stats = {
  user: { email: string; name: string | null; createdAt: string };
  stats: {
    totalGenerations: number;
    generationsThisMonth: number;
    limit: number;
    remaining: number;
    isPro: boolean;
  };
  recentGenerations: { id: string; template: string; createdAt: string; tokensUsed: number }[];
  subscription: { status: string; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null } | null;
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/user/stats')
        .then((r) => r.json())
        .then(setData)
        .finally(() => setLoading(false));
    }
  }, [status]);

  async function handleUpgrade() {
    setUpgrading(true);
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' });
      const { url, error } = await res.json();
      if (error) { alert(error); return; }
      window.location.href = url;
    } finally {
      setUpgrading(false);
    }
  }

  async function handleSaveName() {
    setSavingName(true);
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput }),
    });
    if (res.ok) {
      setData((prev) => prev ? { ...prev, user: { ...prev.user, name: nameInput.trim() } } : null);
      setEditingName(false);
    }
    setSavingName(false);
  }

  async function handleCancel() {
    if (!confirm('¿Seguro que quieres cancelar tu suscripción Pro? Seguirás teniendo acceso hasta el final del periodo actual.')) return;
    setCancelling(true);
    try {
      const res = await fetch('/api/stripe/cancel', { method: 'POST' });
      if (res.ok) {
        setData((prev) => prev ? { ...prev, subscription: prev.subscription ? { ...prev.subscription, cancelAtPeriodEnd: true } : null } : null);
      } else {
        const { error } = await res.json();
        alert(error ?? 'Error al cancelar la suscripción');
      }
    } finally {
      setCancelling(false);
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const stats = data?.stats;
  const isPro = stats?.isPro ?? false;
  const usedPercent = stats ? Math.min((stats.generationsThisMonth / stats.limit) * 100, 100) : 0;
  const nearLimit = (stats?.remaining ?? 0) <= (isPro ? 20 : 3);
  const displayName = data?.user?.name ?? session.user?.email ?? 'Usuario';

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4 sticky top-0 z-50 bg-gray-950/90 backdrop-blur">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <a href="/" className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            YTubViral
          </a>
          <div className="flex items-center gap-3">
            {/* Nombre editable */}
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                  className="bg-gray-800 border border-purple-500 rounded-lg px-3 py-1.5 text-white text-sm outline-none w-36"
                />
                <button onClick={handleSaveName} disabled={savingName} className="text-green-400 hover:text-green-300 text-sm">
                  {savingName ? '...' : 'Guardar'}
                </button>
                <button onClick={() => setEditingName(false)} className="text-gray-500 hover:text-gray-400 text-sm">✕</button>
              </div>
            ) : (
              <button
                onClick={() => { setNameInput(data?.user?.name ?? ''); setEditingName(true); }}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition text-sm"
              >
                <span>{displayName}</span>
                {isPro && <span className="bg-gradient-to-r from-yellow-400 to-orange-400 text-black text-xs font-bold px-2 py-0.5 rounded-full">PRO</span>}
                <span className="text-gray-600 text-xs">✏️</span>
              </button>
            )}
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="text-gray-500 hover:text-gray-300 text-sm transition"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Bienvenida + CTA generar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Hola, {displayName.split(' ')[0]} 👋</h1>
            <p className="text-gray-500 text-sm mt-1">
              {isPro ? `Plan Pro · ${stats?.remaining ?? 0} generaciones restantes este mes` : `Plan gratuito · ${stats?.remaining ?? 0} de ${stats?.limit ?? 10} generaciones restantes`}
            </p>
          </div>
          <a
            href="/generate"
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold px-5 py-2.5 rounded-xl transition shadow-lg shadow-purple-900/20"
          >
            <FaBolt size={14} />
            Generar contenido
          </a>
        </div>

        {/* Upgrade banner (solo free) */}
        {!isPro && (
          <div className={`rounded-2xl p-5 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${nearLimit ? 'bg-red-900/20 border-red-500/40' : 'bg-purple-900/20 border-purple-500/20'}`}>
            <div>
              <p className="text-white font-semibold text-sm">
                {nearLimit ? '⚠️ Casi sin generaciones disponibles' : '✨ Desbloquea el plan Pro'}
              </p>
              <p className="text-gray-400 text-sm mt-0.5">
                {nearLimit ? `Solo te quedan ${stats?.remaining ?? 0} generaciones este mes.` : 'Hasta 200 generaciones al mes por solo 9,99€/mes.'}
              </p>
            </div>
            <button
              onClick={handleUpgrade}
              disabled={upgrading}
              className="shrink-0 flex items-center gap-2 bg-gradient-to-r from-yellow-400 to-orange-400 hover:from-yellow-300 hover:to-orange-300 text-black font-bold py-2 px-5 rounded-xl transition disabled:opacity-60 text-sm"
            >
              <FaCrown size={13} />
              {upgrading ? 'Redirigiendo...' : 'Upgrade a Pro'}
            </button>
          </div>
        )}

        {/* Gestión suscripción Pro */}
        {isPro && (
          <div className="rounded-2xl p-5 border border-purple-500/20 bg-purple-900/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-yellow-400 to-orange-400 rounded-xl flex items-center justify-center shrink-0">
                <FaCrown className="text-black" size={16} />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Plan Pro activo</p>
                {data?.subscription?.cancelAtPeriodEnd ? (
                  <p className="text-yellow-400 text-xs mt-0.5">
                    No se renovará · Acceso hasta el {data.subscription.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                  </p>
                ) : (
                  <p className="text-gray-400 text-xs mt-0.5">
                    Renovación el {data?.subscription?.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                  </p>
                )}
              </div>
            </div>
            {!data?.subscription?.cancelAtPeriodEnd && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="shrink-0 text-gray-500 hover:text-gray-300 disabled:opacity-50 text-xs transition"
              >
                {cancelling ? 'Cancelando...' : 'Cancelar suscripción'}
              </button>
            )}
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-white/5 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center shrink-0">
              <FaChartBar className="text-purple-400" size={18} />
            </div>
            <div>
              <p className="text-gray-500 text-xs">Este mes</p>
              <p className="text-2xl font-bold text-white">{stats?.generationsThisMonth ?? 0}<span className="text-gray-600 text-sm font-normal"> / {stats?.limit}</span></p>
            </div>
          </div>
          <div className="bg-gray-900 border border-white/5 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center shrink-0">
              <FaBolt className="text-blue-400" size={18} />
            </div>
            <div>
              <p className="text-gray-500 text-xs">Restantes</p>
              <p className={`text-2xl font-bold ${nearLimit ? 'text-red-400' : 'text-white'}`}>{stats?.remaining ?? 0}</p>
            </div>
          </div>
          <div className="bg-gray-900 border border-white/5 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center shrink-0">
              <FaCheckCircle className="text-green-400" size={18} />
            </div>
            <div>
              <p className="text-gray-500 text-xs">Total generadas</p>
              <p className="text-2xl font-bold text-white">{stats?.totalGenerations ?? 0}</p>
            </div>
          </div>
        </div>

        {/* Barra de uso */}
        <div className="bg-gray-900 border border-white/5 rounded-2xl p-5">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-semibold text-white">Uso mensual</p>
            <span className="text-xs text-gray-500">{stats?.generationsThisMonth ?? 0} / {stats?.limit ?? 10}</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${nearLimit ? 'bg-gradient-to-r from-red-500 to-orange-500' : isPro ? 'bg-gradient-to-r from-yellow-400 to-orange-400' : 'bg-gradient-to-r from-purple-500 to-blue-500'}`}
              style={{ width: `${usedPercent}%` }}
            />
          </div>
          {stats?.remaining === 0 && (
            <p className="text-xs mt-2 text-gray-500">
              {isPro ? 'Límite alcanzado. Se restablece el 1 del próximo mes.' : <>Límite alcanzado. <button onClick={handleUpgrade} className="text-yellow-400 hover:text-yellow-300 underline">Actualiza a Pro</button> para 200 generaciones/mes.</>}
            </p>
          )}
        </div>

        {/* Historial reciente */}
        <div className="bg-gray-900 border border-white/5 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FaClock className="text-gray-500" size={14} />
              <h2 className="text-sm font-semibold text-white">Generaciones recientes</h2>
            </div>
            <a href="/generate" className="text-xs text-purple-400 hover:text-purple-300 transition flex items-center gap-1">
              <FaPenFancy size={11} />
              Nueva generación
            </a>
          </div>
          {!data?.recentGenerations?.length ? (
            <div className="text-center py-8">
              <p className="text-gray-600 text-sm mb-3">Aún no has generado contenido</p>
              <a href="/generate" className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">
                <FaBolt size={12} />
                Empezar a generar
              </a>
            </div>
          ) : (
            <ul className="space-y-2">
              {data.recentGenerations.map((gen) => (
                <li key={gen.id} className="flex justify-between items-center bg-gray-800/60 hover:bg-gray-800 rounded-xl px-4 py-3 transition">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{TEMPLATE_ICONS[gen.template] ?? '📄'}</span>
                    <div>
                      <p className="text-white text-sm font-medium">{TEMPLATE_LABELS[gen.template] ?? gen.template}</p>
                      <p className="text-gray-600 text-xs">{gen.tokensUsed} tokens</p>
                    </div>
                  </div>
                  <span className="text-gray-600 text-xs">
                    {new Date(gen.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-6 mt-8">
        <div className="max-w-6xl mx-auto flex justify-center gap-6 text-xs text-gray-700">
          <a href="/terms" className="hover:text-gray-500 transition">Términos</a>
          <a href="/privacy" className="hover:text-gray-500 transition">Privacidad</a>
          <a href="/legal" className="hover:text-gray-500 transition">Aviso Legal</a>
        </div>
      </footer>

    </div>
  );
}
