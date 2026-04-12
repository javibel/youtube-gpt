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
  const usedPercent = stats ? (stats.generationsThisMonth / stats.limit) * 100 : 0;
  const nearLimit = (stats?.remaining ?? 0) <= (isPro ? 20 : 3);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black">
      {/* Header */}
      <div className="bg-black/50 border-b border-purple-500 p-6">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div>
            <div className="flex items-center gap-3">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                    className="bg-gray-800 border border-purple-500 rounded px-3 py-1 text-white text-xl font-bold outline-none w-48"
                  />
                  <button onClick={handleSaveName} disabled={savingName} className="text-green-400 hover:text-green-300 text-sm font-medium">
                    {savingName ? '...' : 'Guardar'}
                  </button>
                  <button onClick={() => setEditingName(false)} className="text-gray-500 hover:text-gray-400 text-sm">
                    Cancelar
                  </button>
                </div>
              ) : (
                <>
                  <h1 className="text-2xl font-bold text-white">
                    {data?.user?.name ?? session.user?.email}
                  </h1>
                  <button
                    onClick={() => { setNameInput(data?.user?.name ?? ''); setEditingName(true); }}
                    className="text-gray-500 hover:text-gray-300 text-xs"
                    title="Editar nombre"
                  >
                    ✏️
                  </button>
                </>
              )}
              {isPro && !editingName && (
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
                  : 'Hasta 200 generaciones al mes, sin restricciones diarias.'}
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
            <p className="text-gray-400 text-sm">Restantes este mes</p>
            <p className="text-4xl font-bold text-white mt-1">{stats?.remaining ?? 0}</p>
          </div>
          <div className="bg-gray-900 border border-purple-500/40 rounded-lg p-5">
            <p className="text-gray-400 text-sm">Total generaciones</p>
            <p className="text-4xl font-bold text-white mt-1">{stats?.totalGenerations ?? 0}</p>
          </div>
        </div>

        {/* Barra de uso mensual */}
        <div className="bg-gray-900 border border-purple-500/40 rounded-lg p-5">
          <div className="flex justify-between mb-2">
            <p className="text-white font-semibold">
              {isPro ? 'Uso del plan Pro' : 'Uso del plan gratuito'}
            </p>
            <span className="text-gray-400 text-sm">
              {stats?.generationsThisMonth ?? 0} / {stats?.limit ?? 10} generaciones este mes
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all bg-gradient-to-r ${
                nearLimit ? 'from-red-500 to-orange-500' : isPro ? 'from-yellow-400 to-orange-400' : 'from-purple-500 to-blue-500'
              }`}
              style={{ width: `${Math.min(usedPercent, 100)}%` }}
            />
          </div>
          {stats?.remaining === 0 && !isPro && (
            <p className="text-red-400 text-sm mt-2">
              Alcanzaste el límite.{' '}
              <button onClick={handleUpgrade} className="text-yellow-400 hover:text-yellow-300 underline">
                Actualiza a Pro
              </button>{' '}
              para hasta 200 generaciones al mes.
            </p>
          )}
          {stats?.remaining === 0 && isPro && (
            <p className="text-red-400 text-sm mt-2">
              Alcanzaste el límite del plan Pro este mes. Se restablece el 1 del próximo mes.
            </p>
          )}
        </div>

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

      {/* Footer */}
      <div className="max-w-5xl mx-auto px-6 py-8 flex justify-center gap-6 text-xs text-gray-600">
        <a href="/terms" className="hover:text-gray-400">Términos y Condiciones</a>
        <a href="/privacy" className="hover:text-gray-400">Política de Privacidad</a>
        <a href="/legal" className="hover:text-gray-400">Aviso Legal</a>
      </div>
    </div>
  );
}
