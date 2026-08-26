'use client';

import { useState } from 'react';
import { toast } from '@/components/Toaster';
import { CrossIcon, LockIcon, BoltIcon, TargetIcon, ChatIcon, InfinityIcon, UsersIcon, TrophyIcon, RocketIcon, DiamondIcon } from '@/components/icons';
import { useCurrency } from '@/components/CurrencyProvider';
import { PRICES, formatPrice } from '@/lib/pricing';

interface LimitReachedModalProps {
  onClose: () => void;
  reason?: 'limit' | 'pro_feature' | 'video_tips_limit';
  lang?: 'es' | 'en';
}

export default function LimitReachedModal({ onClose, reason = 'limit', lang = 'es' }: LimitReachedModalProps) {
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly' | 'business_monthly' | 'business_yearly'>('monthly');
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const currency = useCurrency();
  const proMo = formatPrice(PRICES.pro.monthly.eur, currency, lang);
  const proYr = formatPrice(PRICES.pro.yearly.eur, currency, lang);
  const bizMo = formatPrice(PRICES.business.monthly.eur, currency, lang);
  const bizYr = formatPrice(PRICES.business.yearly.eur, currency, lang);
  const proMoEquiv = formatPrice(PRICES.pro.yearly.eur / 12, currency, lang);
  const bizMoEquiv = formatPrice(PRICES.business.yearly.eur / 12, currency, lang);

  async function handleUpgrade() {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      const data = await res.json();
      if (data.error) { toast(data.error, 'error'); return; }
      if (!data.url) { toast(t('No se pudo iniciar el pago. Inténtalo de nuevo.', 'Could not start payment. Please try again.'), 'error'); return; }
      window.location.href = data.url;
    } catch {
      toast(t('Error de conexión. Inténtalo de nuevo.', 'Connection error. Please try again.'), 'error');
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
        className="yv-glass yv-glass--lift relative p-8 max-w-lg w-full"
        style={{ borderRadius: 'var(--yv-radius-xl)' }}
      >
        {/* Botón cerrar */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-600 hover:text-gray-400 transition text-lg leading-none"
          aria-label="Cerrar"
        >
          <CrossIcon size={18} />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="mb-3 flex justify-center">
            {reason === 'pro_feature'
              ? <img src="/icons/lightning.webp" alt="" width={56} height={56} className="object-contain" />
              : <span className="inline-flex items-center justify-center rounded-full" style={{ width: 56, height: 56, background: 'rgba(204,0,255,0.12)', color: '#CC00FF' }}><LockIcon size={26} /></span>}
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {reason === 'pro_feature'
              ? t('Función exclusiva de pago', 'Paid feature')
              : reason === 'video_tips_limit'
              ? t('Ya usaste tu Video Tips gratis', "You've used your free Video Tips")
              : t('Has usado todas tus generaciones', "You've used all your generations")}
          </h2>
          <p className="text-gray-500 text-sm">
            {reason === 'pro_feature'
              ? <>{t('Actualiza tu plan para desbloquear esta función y todas las demás.', 'Upgrade your plan to unlock this feature and all others.')}</>
              : reason === 'video_tips_limit'
              ? <>{t('El plan gratuito incluye 1 Video Tips al mes.', 'The free plan includes 1 Video Tips per month.')} {t('Hazte Pro para generarlos sin límite.', 'Go Pro for unlimited Video Tips.')}</>
              : <>{t('Has alcanzado el límite de', "You've reached the limit of")} <span className="font-semibold" style={{ color: '#00D9FF' }}>{t('10 generaciones', '10 generations')}</span> {t('del plan gratuito este mes.', 'on the free plan this month.')}</>}
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {/* Free */}
          <div
            className="rounded-xl p-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <p className="text-[13px] text-gray-600 uppercase tracking-widest mb-2">{t('Gratis', 'Free')}</p>
            <p className="text-xl font-bold text-gray-400 mb-3">0 €</p>
            <ul className="space-y-1.5 text-[13px] text-gray-600">
              <li className="flex items-center gap-1.5"><CrossIcon size={12} className="text-gray-700 shrink-0" /> {t('10 gen/mes', '10 gen/mo')}</li>
              <li className="flex items-center gap-1.5"><CrossIcon size={12} className="text-gray-700 shrink-0" /> {t('Sin soporte', 'No support')}</li>
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
            <p className="text-xl font-bold text-white mb-1">{proMo}</p>
            <p className="text-[13px] text-gray-500 mb-3">{t('/mes · 200 gen', '/mo · 200 gen')}</p>
            <ul className="space-y-1 text-[13px]">
              <li className="text-gray-300 flex items-center gap-1.5"><BoltIcon size={12} className="shrink-0" /> {t('200 gen/mes', '200 gen/mo')}</li>
              <li className="text-gray-300 flex items-center gap-1.5"><TargetIcon size={12} className="shrink-0" /> {t('Todos los templates', 'All templates')}</li>
              <li className="text-gray-300 flex items-center gap-1.5"><ChatIcon size={12} className="shrink-0" /> {t('Soporte prioritario', 'Priority support')}</li>
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
            <p className="text-xl font-bold text-white mb-1">{bizMo}</p>
            <p className="text-[13px] text-gray-500 mb-3">{t('/mes · Ilimitado', '/mo · Unlimited')}</p>
            <ul className="space-y-1 text-[13px]">
              <li className="text-gray-300 flex items-center gap-1.5"><InfinityIcon size={12} className="shrink-0" /> {t('Ilimitado', 'Unlimited')}</li>
              <li className="text-gray-300 flex items-center gap-1.5"><UsersIcon size={12} className="shrink-0" /> {t('5 miembros', '5 members')}</li>
              <li className="text-gray-300 flex items-center gap-1.5"><TrophyIcon size={12} className="shrink-0" /> {t('Todo incluido', 'Everything included')}</li>
            </ul>
          </button>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-4">
          <div className="yv-chip flex items-center p-0 text-[13px] tracking-wider uppercase overflow-hidden">
            <button
              onClick={() => setSelectedPlan(isPro ? 'monthly' : 'business_monthly')}
              className="px-4 py-1.5 transition font-bold"
              style={{
                background: (selectedPlan === 'monthly' || selectedPlan === 'business_monthly') ? (isPro ? '#00D9FF' : '#7C4DFF') : 'transparent',
                color: (selectedPlan === 'monthly' || selectedPlan === 'business_monthly') ? '#000' : '#a1a1aa',
              }}
            >
              {t('Mensual', 'Monthly')}
            </button>
            <button
              onClick={() => setSelectedPlan(isPro ? 'yearly' : 'business_yearly')}
              className="px-4 py-1.5 transition font-bold flex items-center gap-1.5"
              style={{
                background: (selectedPlan === 'yearly' || selectedPlan === 'business_yearly') ? (isPro ? '#00D9FF' : '#7C4DFF') : 'transparent',
                color: (selectedPlan === 'yearly' || selectedPlan === 'business_yearly') ? '#000' : '#a1a1aa',
              }}
            >
              {t('Anual', 'Yearly')}
              <span className="rounded-full px-1.5 py-0.5 text-[8px] font-bold" style={{ background: 'rgba(0,0,0,0.2)' }}>-17%</span>
            </button>
          </div>
        </div>

        {/* Price summary */}
        <div className="text-center mb-4">
          {selectedPlan === 'yearly' && <p className="text-[13px]" style={{ color: '#7CFF00' }}>{t(`${proYr}/año = ${proMoEquiv}/mes`, `${proYr}/yr = ${proMoEquiv}/mo`)}</p>}
          {selectedPlan === 'business_yearly' && <p className="text-[13px]" style={{ color: '#7CFF00' }}>{t(`${bizYr}/año = ${bizMoEquiv}/mes`, `${bizYr}/yr = ${bizMoEquiv}/mo`)}</p>}
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
              {t('Redirigiendo…', 'Redirecting…')}
            </span>
          ) : isPro ? (
            <span className="inline-flex items-center justify-center gap-2">
              <RocketIcon size={16} />
              {t('Probar Pro gratis 7 días', 'Try Pro free for 7 days')} — {selectedPlan === 'yearly' ? t(`${proYr}/año`, `${proYr}/yr`) : t(`${proMo}/mes`, `${proMo}/mo`)}
            </span>
          ) : (
            <span className="inline-flex items-center justify-center gap-2">
              <DiamondIcon size={16} />
              {t('Actualizar a Business', 'Upgrade to Business')} — {selectedPlan === 'business_yearly' ? t(`${bizYr}/año`, `${bizYr}/yr`) : t(`${bizMo}/mes`, `${bizMo}/mo`)}
            </span>
          )}
        </button>

        <p className="text-center text-[13px] text-gray-700 mt-3">
          {t('Cancela cuando quieras · Sin permanencia', 'Cancel anytime · No commitment')}
        </p>
      </div>
    </div>
  );
}
