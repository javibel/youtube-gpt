'use client';

import { useState, useEffect } from 'react';

export default function TermsPage() {
  const [lang, setLang] = useState<'es'|'en'>('es');
  useEffect(() => {
    const s = localStorage.getItem('ytubviral_lang') as 'es'|'en' | null;
    if (s) setLang(s);
  }, []);
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-10">

        <div>
          <a href="/" className="inline-flex items-center gap-2 mb-10">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="13" stroke="#9B2020" strokeWidth="2.2"/>
              <polygon points="13,10.5 13,21.5 23,16" fill="#9B2020"/>
            </svg>
            <span className="font-display font-bold text-[14px] text-white">YTubViral<span style={{ color: 'var(--red)' }}>.</span>com</span>
          </a>
          <p className="font-mono-jb text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>{t('LEGAL', 'LEGAL')}</p>
          <h1 className="font-display font-bold text-4xl text-white">{t('Términos y Condiciones', 'Terms and Conditions')}</h1>
          <p className="text-zinc-500 text-sm mt-2 font-mono-jb">{t('Última actualización: abril de 2026', 'Last updated: April 2026')}</p>
        </div>

        {[
          {
            title: t('1. Identificación del servicio', '1. Service identification'),
            body: t(
              'YTubViral es un servicio web accesible en ytubviral.com que ofrece herramientas de generación de contenido asistidas por inteligencia artificial para creadores de contenido en YouTube. El servicio es gestionado por un particular con domicilio en España, contactable a través de ytbeviral@gmail.com.',
              'YTubViral is a web service accessible at ytubviral.com that offers AI-assisted content generation tools for YouTube content creators. The service is managed by an individual based in Spain, reachable at ytbeviral@gmail.com.'
            ),
          },
          {
            title: t('2. Aceptación de los términos', '2. Acceptance of terms'),
            body: t(
              'El acceso y uso de YTubViral implica la aceptación plena y sin reservas de los presentes Términos y Condiciones. Si no está de acuerdo con alguno de los términos aquí establecidos, debe abstenerse de utilizar el servicio.',
              'Accessing and using YTubViral implies full and unreserved acceptance of these Terms and Conditions. If you do not agree with any of the terms set out here, you must refrain from using the service.'
            ),
          },
          {
            title: t('3. Descripción del servicio', '3. Service description'),
            body: t(
              'YTubViral proporciona acceso a herramientas de generación de contenido (títulos, descripciones, scripts, captions y conceptos para miniaturas) para vídeos de YouTube mediante modelos de inteligencia artificial de terceros.',
              'YTubViral provides access to content generation tools (titles, descriptions, scripts, captions and thumbnail concepts) for YouTube videos using third-party artificial intelligence models.'
            ),
          },
          {
            title: t('4. Planes y precios', '4. Plans and pricing'),
            body: t(
              'Plan gratuito: hasta 10 generaciones por mes natural, sin coste. Plan Pro: hasta 200 generaciones por mes natural, por un precio de 9,99 € al mes. El plan se renueva automáticamente cada mes hasta que el usuario lo cancele. Los precios pueden modificarse con un preaviso mínimo de 30 días comunicado por email.',
              'Free plan: up to 10 generations per calendar month, at no cost. Pro plan: up to 200 generations per calendar month, at a price of €9.99/month. The plan renews automatically each month until cancelled by the user. Prices may be modified with a minimum notice of 30 days communicated by email.'
            ),
          },
          {
            title: t('5. Pagos y cancelaciones', '5. Payments and cancellations'),
            body: t(
              'Los pagos se procesan a través de Stripe, proveedor externo de servicios de pago. YTubViral no almacena datos de tarjetas bancarias. El usuario puede cancelar su suscripción Pro en cualquier momento desde su panel de usuario. La cancelación tendrá efecto al finalizar el periodo de facturación en curso. No se realizarán reembolsos por el periodo no consumido.',
              'Payments are processed through Stripe, a third-party payment service provider. YTubViral does not store bank card details. The user may cancel their Pro subscription at any time from their dashboard. Cancellation takes effect at the end of the current billing period. No refunds will be issued for the unused period.'
            ),
          },
          {
            title: t('6. Uso aceptable', '6. Acceptable use'),
            body: t(
              'El usuario se compromete a utilizar YTubViral de forma lícita. Queda prohibido usar el servicio para generar contenido ilegal, difamatorio o fraudulento; intentar eludir los límites técnicos; revender el servicio sin autorización; o usarlo de forma automatizada masiva. YTubViral se reserva el derecho a suspender cuentas que incumplan estas condiciones.',
              'The user agrees to use YTubViral lawfully. It is prohibited to use the service to generate illegal, defamatory or fraudulent content; attempt to circumvent technical limits; resell the service without authorisation; or use it in a massive automated manner. YTubViral reserves the right to suspend accounts that violate these conditions.'
            ),
          },
          {
            title: t('7. Propiedad intelectual del contenido generado', '7. Intellectual property of generated content'),
            body: t(
              'El contenido generado a través de YTubViral es propiedad del usuario que lo genera. YTubViral no reclama derechos sobre dicho contenido. No obstante, el usuario es el único responsable del uso que haga del contenido generado.',
              'Content generated through YTubViral is owned by the user who generates it. YTubViral claims no rights over such content. However, the user is solely responsible for the use made of the generated content.'
            ),
          },
          {
            title: t('8. Limitación de responsabilidad', '8. Limitation of liability'),
            body: t(
              'YTubViral se ofrece "tal cual" y no garantiza que el servicio sea ininterrumpido o libre de errores. YTubViral no será responsable de pérdidas de ingresos, daños indirectos o pérdida de datos. La responsabilidad máxima no excederá el importe abonado en los tres meses anteriores al hecho que origina la reclamación.',
              'YTubViral is provided "as is" and does not guarantee that the service will be uninterrupted or error-free. YTubViral shall not be liable for loss of revenue, indirect damages or data loss. Maximum liability shall not exceed the amount paid in the three months prior to the claim.'
            ),
          },
          {
            title: t('9. Modificaciones del servicio', '9. Service modifications'),
            body: t(
              'YTubViral se reserva el derecho a modificar, suspender o interrumpir el servicio en cualquier momento. En caso de cambios sustanciales en los precios o condiciones, se notificará al usuario con al menos 30 días de antelación.',
              'YTubViral reserves the right to modify, suspend or discontinue the service at any time. In the event of substantial changes to prices or conditions, the user will be notified at least 30 days in advance.'
            ),
          },
          {
            title: t('10. Ley aplicable y jurisdicción', '10. Applicable law and jurisdiction'),
            body: t(
              'Los presentes términos se rigen por la legislación española. Para cualquier controversia, ambas partes se someten a los juzgados y tribunales competentes conforme a la normativa española vigente.',
              'These terms are governed by Spanish law. For any dispute, both parties submit to the competent courts in accordance with current Spanish regulations.'
            ),
          },
          {
            title: t('11. Contacto', '11. Contact'),
            body: t('Para cualquier consulta sobre estos términos: ytbeviral@gmail.com', 'For any questions about these terms: ytbeviral@gmail.com'),
          },
        ].map((s, i) => (
          <section key={i} className="space-y-3 pb-8 border-b border-white/5 last:border-0">
            <h2 className="font-display font-bold text-lg text-white">{s.title}</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">{s.body}</p>
          </section>
        ))}

        <div className="flex gap-5 font-mono-jb text-xs text-zinc-600 pt-4">
          <a href="/privacy" className="hover:text-zinc-400 transition">{t('Privacidad', 'Privacy')}</a>
          <a href="/legal" className="hover:text-zinc-400 transition">{t('Aviso Legal', 'Legal Notice')}</a>
          <a href="/" className="hover:text-zinc-400 transition">{t('Volver al inicio', 'Back to home')}</a>
        </div>
      </div>
    </div>
  );
}
