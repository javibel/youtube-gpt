'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const TEMPLATE_LABELS: Record<string, string> = {
  titles: 'Títulos',
  descriptions: 'Descripciones',
  captions: 'Captions',
  thumbnails: 'Thumbnails',
  scripts: 'Scripts',
};

type Stats = {
  user: { email: string; name: string | null; createdAt: string };
  stats: {
    totalGenerations: number;
    generationsThisMonth: number;
    limit: number | null;
    remaining: number | null;
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

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
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
      if (error) {
        alert(error);
        return;
      }
      window.location.href = url;
    } finally {
      setUpgrading(false);
    }
  }

  async function handleCancel() {
    if (!confirm('¿Seguro que quieres cancelar tu suscripción Pro? Seguirás teniendo acceso hasta el final del periodo actual.')) return;
    setCancelling(true);
    try {
      const res = await fetch('/api/stripe/cancel', { method: 'POST' });
      if (res.ok) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                subscription: prev.subscription
                  ? { ...prev.subscription, cancelAtPeriodEnd: true }
                  : null,
              }
            : null
        );
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
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black flex items-center justify-center">
        <p className="text-white text-lg">Cargando...</p>
      </div>
    );
  }

  if (!session) return null;

  const stats = data?.stats;
  const isPro = stats?.isPro ?? false;
  const usedPercent = stats && stats.limit ? (stats.generationsThisMonth / stats.limit) * 100 : 0;
  const nearLimit = !isPro && (stats?.remaining ?? 10) <= 3;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black">
      {/* Header */}
      <div className="bg-black/50 border-b border-purple-500 p-6">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">Dashboard</h1>
              {isPro && (
                <span className="bg-gradient-to-r from-yellow-400 to-orange-400 text-black text-xs font-bold px-2 py-1 rounded-full">
                  PRO
                </span>
              )}
            </div>
            <p className="text-gray-400 text-sm mt-1">{session.user?.email}</p>
          </div>
          <div className="flex gap-3">
            <a
              href="/"
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition"
            >
              Generar contenido
            </a>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded transition"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Upgrade banner */}
        {!isPro && (
          <div
            className={`rounded-lg p-5 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
              nearLimit
                ? 'bg-red-900/30 border-red-500/60'
                : 'bg-purple-900/30 border-purple-500/40'
            }`}
          >
            <div>
              <p className="text-white font-semibold">
                {nearLimit
                  ? '⚠️ Casi sin generaciones disponibles'
                  : 'Actualiza al plan Pro'}
              </p>
              <p className="text-gray-400 text-sm mt-1">
                {nearLimit
                  ? `Solo te quedan ${stats?.remaining ?? 0} generaciones este mes.`
                  : 'Generaciones ilimitadas, sin restricciones mensuales.'}
              </p>
            </div>
            <button
              onClick={handleUpgrade}
              disabled={upgrading}
              className="shrink-0 bg-gradient-to-r from-yellow-400 to-orange-400 hover:from-yellow-300 hover:to-orange-300 text-black font-bold py-2 px-5 rounded transition disabled:opacity-60"
            >
              {upgrading ? 'Redirigiendo...' : 'Upgrade a Pro →'}
            </button>
          </div>
        )}

        {/* Gestión suscripción Pro */}
        {isPro && (
          <div className="rounded-lg p-5 border border-purple-500/40 bg-gray-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-white font-semibold">Plan Pro activo</p>
              {data?.subscription?.cancelAtPeriodEnd ? (
                <p className="text-yellow-400 text-sm mt-1">
                  Tu suscripción no se renovará. Acceso Pro hasta el{' '}
                  {data.subscription.currentPeriodEnd
                    ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
                    : '—'}
                </p>
              ) : (
                <p className="text-gray-400 text-sm mt-1">
                  Generaciones ilimitadas. Se renueva el{' '}
                  {data?.subscription?.currentPeriodEnd
                    ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
                    : '—'}
                </p>
              )}
            </div>
            {!data?.subscription?.cancelAtPeriodEnd && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="shrink-0 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded transition"
              >
                {cancelling ? 'Cancelando...' : 'Cancelar suscripción'}
              </button>
            )}
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-purple-500/40 rounded-lg p-5">
            <p className="text-gray-400 text-sm">Generaciones este mes</p>
            <p className="text-4xl font-bold text-white mt-1">
              {stats?.generationsThisMonth ?? 0}
              {!isPro && (
                <span className="text-gray-500 text-lg font-normal"> / {stats?.limit ?? 10}</span>
              )}
            </p>
          </div>
          <div className="bg-gray-900 border border-purple-500/40 rounded-lg p-5">
            <p className="text-gray-400 text-sm">
              {isPro ? 'Plan' : 'Restantes este mes'}
            </p>
            {isPro ? (
              <p className="text-2xl font-bold mt-1 bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
                Pro — Ilimitado
              </p>
            ) : (
              <p className="text-4xl font-bold text-white mt-1">{stats?.remaining ?? 10}</p>
            )}
          </div>
          <div className="bg-gray-900 border border-purple-500/40 rounded-lg p-5">
            <p className="text-gray-400 text-sm">Total generaciones</p>
            <p className="text-4xl font-bold text-white mt-1">{stats?.totalGenerations ?? 0}</p>
          </div>
        </div>

        {/* Progress bar (solo para free) */}
        {!isPro && (
          <div className="bg-gray-900 border border-purple-500/40 rounded-lg p-5">
            <div className="flex justify-between mb-2">
              <p className="text-white font-semibold">Uso del plan gratuito</p>
              <span className="text-gray-400 text-sm">
                {stats?.generationsThisMonth ?? 0} / {stats?.limit ?? 10} generaciones
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-purple-500 to-blue-500 h-3 rounded-full transition-all"
                style={{ width: `${Math.min(usedPercent, 100)}%` }}
              />
            </div>
            {(stats?.remaining ?? 10) === 0 && (
              <p className="text-red-400 text-sm mt-2">
                Alcanzaste el límite.{' '}
                <button
                  onClick={handleUpgrade}
                  className="text-yellow-400 hover:text-yellow-300 underline"
                >
                  Actualiza a Pro
                </button>{' '}
                para generaciones ilimitadas.
              </p>
            )}
          </div>
        )}

        {/* Recent generations */}
        <div className="bg-gray-900 border border-purple-500/40 rounded-lg p-5">
          <h2 className="text-white font-semibold mb-4">Generaciones recientes</h2>
          {data?.recentGenerations?.length === 0 ? (
            <p className="text-gray-500 text-sm">
              Aún no has generado contenido.{' '}
              <a href="/" className="text-purple-400 hover:text-purple-300">
                Genera tu primer contenido →
              </a>
            </p>
          ) : (
            <ul className="space-y-3">
              {data?.recentGenerations?.map((gen) => (
                <li
                  key={gen.id}
                  className="flex justify-between items-center bg-gray-800 rounded px-4 py-3"
                >
                  <div>
                    <span className="text-white font-medium">
                      {TEMPLATE_LABELS[gen.template] ?? gen.template}
                    </span>
                    <span className="text-gray-500 text-xs ml-3">{gen.tokensUsed} tokens</span>
                  </div>
                  <span className="text-gray-500 text-xs">
                    {new Date(gen.createdAt).toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
