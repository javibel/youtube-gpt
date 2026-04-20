'use client';

import { useState } from 'react';

interface LimitReachedModalProps {
  onClose: () => void;
  reason?: 'limit' | 'pro_feature';
}

const BENEFITS = [
  { icon: '⚡', text: '200 generaciones al mes' },
  { icon: '🎯', text: 'Todos los templates disponibles' },
  { icon: '🚀', text: 'Prioridad en nuevas funciones' },
  { icon: '💬', text: 'Soporte prioritario' },
];

export default function LimitReachedModal({ onClose, reason = 'limit' }: LimitReachedModalProps) {
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' });
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

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 px-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
    >
      <div
        className="relative rounded-2xl p-8 max-w-md w-full"
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
              ? 'Opción exclusiva del Plan Pro'
              : 'Has usado todas tus generaciones'}
          </h2>
          <p className="text-gray-500 text-sm">
            {reason === 'pro_feature'
              ? <>Este template solo está disponible en el <span className="font-semibold" style={{ color: '#00D9FF' }}>Plan Pro</span>. Actualiza para desbloquearlo junto a todos los demás.</>
              : <>Has alcanzado el límite de <span className="font-semibold" style={{ color: '#00D9FF' }}>10 generaciones</span> del plan gratuito este mes. Pásate a Pro y no pares.</>}
          </p>
        </div>

        {/* Comparativa */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {/* Free */}
          <div
            className="rounded-xl p-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <p className="text-xs text-gray-600 uppercase tracking-widest mb-2">Gratis</p>
            <p className="text-xl font-bold text-gray-400 mb-3">0 €</p>
            <ul className="space-y-1.5 text-xs text-gray-600">
              <li className="flex items-center gap-1.5"><span className="text-gray-700">✗</span> 10 gen/mes</li>
              <li className="flex items-center gap-1.5"><span className="text-gray-700">✗</span> Sin soporte</li>
              <li className="flex items-center gap-1.5"><span className="text-gray-700">✗</span> Sin prioridad</li>
            </ul>
          </div>
          {/* Pro */}
          <div
            className="rounded-xl p-4 relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(0,217,255,0.08) 0%, rgba(204,0,255,0.08) 100%)',
              border: '1px solid rgba(0,217,255,0.3)',
              boxShadow: '0 0 20px rgba(0,217,255,0.08)',
            }}
          >
            <div
              className="absolute top-2 right-2 text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'linear-gradient(90deg, #00D9FF, #CC00FF)', color: '#000' }}
            >
              PRO
            </div>
            <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(0,217,255,0.7)' }}>Pro</p>
            <p className="text-xl font-bold text-white mb-3">
              9,99 €<span className="text-xs text-gray-500 font-normal">/mes</span>
            </p>
            <ul className="space-y-1.5 text-xs">
              {BENEFITS.map((b) => (
                <li key={b.text} className="flex items-center gap-1.5 text-gray-300">
                  <span>{b.icon}</span> {b.text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="btn-neon w-full py-4 rounded-xl font-bold text-base tracking-wide transition-all relative overflow-hidden"
          style={{ fontSize: '1rem' }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#000' }} />
              Redirigiendo…
            </span>
          ) : (
            '🚀 Actualizar a Pro — 9,99 €/mes'
          )}
        </button>

        <p className="text-center text-xs text-gray-700 mt-3">
          Cancela cuando quieras · Sin permanencia
        </p>
      </div>
    </div>
  );
}
