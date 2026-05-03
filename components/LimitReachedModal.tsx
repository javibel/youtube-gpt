'use client';

import { useState } from 'react';

interface LimitReachedModalProps {
  onClose: () => void;
  reason?: 'limit' | 'pro_feature';
}

export default function LimitReachedModal({ onClose, reason = 'limit' }: LimitReachedModalProps) {
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly' | 'business_monthly' | 'business_yearly'>('monthly');

  async function handleUpgrade() {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      if (!data.url) { alert('No se pudo iniciar el pago. Inténtalo de nuevo.'); return; }
      window.location.href = data.url;
    } catch {
      alert('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  const isPro = selectedPlan === 'monthly' || selectedPlan === 'yearly';

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 px-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
    >
      <div
        className="relative rounded-2xl p-8 max-w-lg w-full"
        style={{
          background: 'rgba(10,10,25,0.97)',
          border: '1px solid rgba(204,0,255,0.35)',
          boxShadow: '0 0 60px rgba(204,0,255,0.15), 0 0 120px rgba(0,217,255,0.08)',
        }}
      >
        {/* Botón cerrar */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-600 hover:text-gray-400 transition text-lg leading-none"
          aria-label="Cerrar"
        >
          ✕
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">{reason === 'pro_feature' ? '⚡' : '🔒'}</div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {reason === 'pro_feature'
              ? 'Función exclusiva de pago'
              : 'Has usado todas tus generaciones'}
          </h2>
          <p className="text-gray-500 text-sm">
            {reason === 'pro_feature'
              ? <>Actualiza tu plan para desbloquear esta función y todas las demás.</>
              : <>Has alcanzado el límite de <span className="font-semibold" style={{ color: '#00D9FF' }}>10 generaciones</span> del plan gratuito este mes.</>}
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {/* Free */}
          <div
            className="rounded-xl p-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <p className="text-[13px] text-gray-600 uppercase tracking-widest mb-2">Gratis</p>
            <p className="text-xl font-bold text-gray-400 mb-3">0 €</p>
            <ul className="space-y-1.5 text-[13px] text-gray-600">
              <li className="flex items-center gap-1.5"><span className="text-gray-700">✗</span> 10 gen/mes</li>
              <li className="flex items-center gap-1.5"><span className="text-gray-700">✗</span> Sin soporte</li>
            </ul>
          </div>

          {/* Pro */}
          <button
            type="button"
            onClick={() => setSelectedPlan('monthly')}
            className="rounded-xl p-4 relative overflow-hidden text-left transition-all"
            style={{
              background: isPro
                ? 'linear-gradient(135deg, rgba(0,217,255,0.08) 0%, rgba(204,0,255,0.08) 100%)'
                : 'rgba(255,255,255,0.03)',
              border: isPro ? '1px solid rgba(0,217,255,0.4)' : '1px solid rgba(255,255,255,0.07)',
              boxShadow: isPro ? '0 0 20px rgba(0,217,255,0.08)' : 'none',
            }}
          >
            <div
              className="absolute top-2 right-2 text-[8px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'linear-gradient(90deg, #00D9FF, #CC00FF)', color: '#000' }}
            >
              PRO
            </div>
            <p className="text-[13px] uppercase tracking-widest mb-2" style={{ color: isPro ? 'rgba(0,217,255,0.7)' : '#71717a' }}>Pro</p>
            <p className="text-xl font-bold text-white mb-1">9,99 €</p>
            <p className="text-[13px] text-gray-500 mb-3">/mes · 200 gen</p>
            <ul className="space-y-1 text-[13px]">
              <li className="text-gray-300">⚡ 200 gen/mes</li>
              <li className="text-gray-300">🎯 Todos los templates</li>
              <li className="text-gray-300">💬 Soporte prioritario</li>
            </ul>
          </button>

          {/* Business */}
          <button
            type="button"
            onClick={() => setSelectedPlan('business_monthly')}
            className="rounded-xl p-4 relative overflow-hidden text-left transition-all"
            style={{
              background: !isPro
                ? 'linear-gradient(135deg, rgba(124,77,255,0.1) 0%, rgba(179,136,255,0.08) 100%)'
                : 'rgba(255,255,255,0.03)',
              border: !isPro ? '1px solid rgba(124,77,255,0.4)' : '1px solid rgba(255,255,255,0.07)',
              boxShadow: !isPro ? '0 0 20px rgba(124,77,255,0.08)' : 'none',
            }}
          >
            <div
              className="absolute top-2 right-2 text-[8px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'linear-gradient(90deg, #B388FF, #7C4DFF)', color: '#000' }}
            >
              BIZ
            </div>
            <p className="text-[13px] uppercase tracking-widest mb-2" style={{ color: !isPro ? '#B388FF' : '#71717a' }}>Business</p>
            <p className="text-xl font-bold text-white mb-1">29,99 €</p>
            <p className="text-[13px] text-gray-500 mb-3">/mes · Ilimitado</p>
            <ul className="space-y-1 text-[13px]">
              <li className="text-gray-300">♾️ Ilimitado</li>
              <li className="text-gray-300">👥 5 miembros</li>
              <li className="text-gray-300">🏆 Todo incluido</li>
            </ul>
          </button>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-4">
          <div className="flex items-center rounded-full border border-white/10 bg-black/40 text-[13px] tracking-wider uppercase overflow-hidden">
            <button
              onClick={() => setSelectedPlan(isPro ? 'monthly' : 'business_monthly')}
              className="px-4 py-1.5 transition font-bold"
              style={{
                background: (selectedPlan === 'monthly' || selectedPlan === 'business_monthly') ? (isPro ? '#00D9FF' : '#7C4DFF') : 'transparent',
                color: (selectedPlan === 'monthly' || selectedPlan === 'business_monthly') ? '#000' : '#a1a1aa',
              }}
            >
              Mensual
            </button>
            <button
              onClick={() => setSelectedPlan(isPro ? 'yearly' : 'business_yearly')}
              className="px-4 py-1.5 transition font-bold flex items-center gap-1.5"
              style={{
                background: (selectedPlan === 'yearly' || selectedPlan === 'business_yearly') ? (isPro ? '#00D9FF' : '#7C4DFF') : 'transparent',
                color: (selectedPlan === 'yearly' || selectedPlan === 'business_yearly') ? '#000' : '#a1a1aa',
              }}
            >
              Anual
              <span className="rounded-full px-1.5 py-0.5 text-[8px] font-bold" style={{ background: 'rgba(0,0,0,0.2)' }}>-17%</span>
            </button>
          </div>
        </div>

        {/* Price summary */}
        <div className="text-center mb-4">
          {selectedPlan === 'yearly' && <p className="text-[13px]" style={{ color: '#7CFF00' }}>99,99€/año = 8,33€/mes</p>}
          {selectedPlan === 'business_yearly' && <p className="text-[13px]" style={{ color: '#7CFF00' }}>299€/año = 24,92€/mes</p>}
        </div>

        {/* CTA */}
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="w-full py-4 rounded-xl font-bold text-base tracking-wide transition-all relative overflow-hidden"
          style={{
            background: isPro
              ? 'linear-gradient(90deg, #00D9FF, #CC00FF)'
              : 'linear-gradient(90deg, #B388FF, #7C4DFF)',
            color: '#000',
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#000' }} />
              Redirigiendo…
            </span>
          ) : isPro ? (
            `🚀 Actualizar a Pro — ${selectedPlan === 'yearly' ? '99,99 €/año' : '9,99 €/mes'}`
          ) : (
            `💎 Actualizar a Business — ${selectedPlan === 'business_yearly' ? '299 €/año' : '29,99 €/mes'}`
          )}
        </button>

        <p className="text-center text-[13px] text-gray-700 mt-3">
          Cancela cuando quieras · Sin permanencia
        </p>
      </div>
    </div>
  );
}
