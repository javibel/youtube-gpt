'use client';

import { useLang } from '@/components/LangProvider';

export default function AffiliatesTermsClient() {
  const lang = useLang();
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-10">

        <div>
          <a href="/" className="inline-flex items-center gap-1 mb-10">
            <svg width="14" height="14" viewBox="7 7 18 18" fill="none">
              <circle cx="16" cy="16" r="8" fill="#ee4d5e"/>
            </svg>
            <span className="font-display font-bold text-[14px] text-white">YTubViral<span style={{ color: 'var(--red)' }}>.</span>com</span>
          </a>
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>{t('LEGAL — PROGRAMA DE AFILIADOS', 'LEGAL — AFFILIATE PROGRAM')}</p>
          <h1 className="font-display font-bold text-4xl text-white">{t('Términos del programa de afiliados', 'Affiliate program terms')}</h1>
          <p className="text-zinc-500 text-sm mt-2 font-mono-jb">{t('Última actualización: julio de 2026', 'Last updated: July 2026')}</p>
          <p className="text-zinc-400 text-sm mt-4 leading-relaxed">
            {t(
              'Estos términos rigen la participación en el programa de afiliados de YTubViral y complementan (no sustituyen) los ',
              'These terms govern participation in the YTubViral affiliate program and complement (not replace) the general '
            )}
            <a href="/terms" className="underline hover:text-white transition">{t('Términos y Condiciones generales', 'Terms and Conditions')}</a>
            {t(' del servicio.', ' of the service.')}
          </p>
        </div>

        {[
          {
            title: t('1. Relación', '1. Relationship'),
            body: t(
              'Este programa no crea ninguna relación laboral, de agencia ni societaria entre YTubViral y el afiliado. El afiliado actúa como tercero independiente y es responsable de sus propias obligaciones fiscales sobre los ingresos que reciba por este programa; YTubViral puede requerir factura antes de liquidar un pago.',
              'This program does not create any employment, agency, or partnership relationship between YTubViral and the affiliate. The affiliate acts as an independent third party and is solely responsible for their own tax obligations on income received through this program; YTubViral may require an invoice before settling a payment.'
            ),
          },
          {
            title: t('2. Comisión', '2. Commission'),
            body: t(
              '30% recurrente sobre el importe neto (sin IVA, con descuentos ya aplicados) de cada factura cobrada a un usuario referido, durante los 12 meses siguientes a su primer pago. Estas condiciones pueden variar por acuerdo individual con partners concretos, y en ese caso prevalece lo pactado por escrito.',
              '30% recurring on the net amount (excluding tax, after any applied discounts) of each invoice collected from a referred user, for the 12 months following their first payment. These terms may vary under an individual agreement with specific partners, in which case the written agreement prevails.'
            ),
          },
          {
            title: t('3. Liquidación', '3. Payout'),
            body: t(
              'Mensual, con un mínimo de 50 € acumulados (por debajo de ese umbral, el saldo pasa al mes siguiente) y una retención de 30 días desde el devengo de cada comisión antes de ser pagable. Pago por PayPal o transferencia, gestionado a mano.',
              'Monthly, with a €50 minimum accrued balance (below that threshold, the balance rolls to the next month) and a 30-day holding period from accrual before a commission becomes payable. Paid via PayPal or bank transfer, processed manually.'
            ),
          },
          {
            title: t('4. Reversiones', '4. Reversals'),
            body: t(
              'Si un usuario referido recibe un reembolso (incluida la garantía de devolución de 30 días de YTubViral), la comisión correspondiente a esa factura se revierte. Si ya se había pagado, YTubViral podrá reclamar su devolución o descontarla de la siguiente liquidación.',
              "If a referred user receives a refund (including YTubViral's 30-day money-back guarantee), the commission tied to that invoice is reversed. If it was already paid, YTubViral may claw it back or deduct it from the next payout."
            ),
          },
          {
            title: t('5. Conducta prohibida', '5. Prohibited conduct'),
            body: t(
              'No está permitido: pujar por "YTubViral" o variantes de la marca en campañas de anuncios de pago; spam o mensajes no solicitados masivos; crear o usar cupones/descuentos no autorizados por YTubViral; auto-referirse (registrarse a través del propio enlace o código, o hacerlo para cuentas propias). El incumplimiento puede resultar en la terminación inmediata del acuerdo y la pérdida de comisiones pendientes.',
              'Not allowed: bidding on "YTubViral" or brand variants in paid ad campaigns; spam or unsolicited bulk messaging; creating or using discount codes not authorized by YTubViral; self-referral (signing up through your own link or code, or doing so for your own accounts). Violations may result in immediate termination and forfeiture of pending commissions.'
            ),
          },
          {
            title: t('6. Terminación', '6. Termination'),
            body: t(
              'Cualquiera de las partes puede terminar este acuerdo en cualquier momento. YTubViral avisará con al menos 30 días de antelación salvo en caso de incumplimiento grave (conducta prohibida arriba), y pagará las comisiones ya devengadas y fuera del periodo de retención en la siguiente liquidación ordinaria.',
              'Either party may terminate this agreement at any time. YTubViral will give at least 30 days\' notice except in cases of serious violation (prohibited conduct above), and will pay any commissions already accrued and past the holding period in the next regular payout.'
            ),
          },
          {
            title: t('7. Contacto', '7. Contact'),
            body: t(
              'Para cualquier consulta sobre el programa de afiliados: hello@ytubviral.com',
              'For any questions about the affiliate program: hello@ytubviral.com'
            ),
          },
        ].map((s, i) => (
          <section key={i} className="space-y-3 pb-8 border-b border-white/5 last:border-0">
            <h2 className="font-display font-bold text-lg text-white">{s.title}</h2>
            <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-line">{s.body}</p>
          </section>
        ))}

        <div className="flex gap-5 font-mono-jb text-[13px] text-zinc-600 pt-4">
          <a href="/affiliates" className="hover:text-zinc-400 transition">{t('Programa de afiliados', 'Affiliate program')}</a>
          <a href="/terms" className="hover:text-zinc-400 transition">{t('Términos generales', 'General terms')}</a>
          <a href="/privacy" className="hover:text-zinc-400 transition">{t('Privacidad', 'Privacy')}</a>
          <a href="/" className="hover:text-zinc-400 transition">{t('Volver al inicio', 'Back to home')}</a>
        </div>
      </div>
    </div>
  );
}
