'use client';

import { useState, useEffect } from 'react';

export default function PrivacyPage() {
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
          <p className="font-mono-jb text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>LEGAL</p>
          <h1 className="font-display font-bold text-4xl text-white">{t('Política de Privacidad', 'Privacy Policy')}</h1>
          <p className="text-zinc-500 text-sm mt-2 font-mono-jb">{t('Última actualización: abril de 2026', 'Last updated: April 2026')}</p>
        </div>

        {[
          {
            title: t('1. Responsable del tratamiento', '1. Data controller'),
            body: t(
              'El responsable del tratamiento de los datos personales recogidos a través de YTubViral es un particular con domicilio en España, contactable en ytbeviral@gmail.com.',
              'The controller of personal data collected through YTubViral is an individual based in Spain, reachable at ytbeviral@gmail.com.'
            ),
          },
          {
            title: t('2. Datos que recogemos', '2. Data we collect'),
            body: t(
              'Recogemos únicamente los datos necesarios para prestar el servicio: nombre y dirección de email (al registrarse), historial de generaciones (inputs y contenido generado para mostrar en el dashboard), y datos de suscripción (plan y estado). Los datos de pago son gestionados íntegramente por Stripe y no son accesibles para YTubViral.',
              'We collect only the data necessary to provide the service: name and email address (upon registration), generation history (inputs and generated content to display in the dashboard), and subscription data (plan and status). Payment data is managed entirely by Stripe and is not accessible to YTubViral.'
            ),
          },
          {
            title: t('3. Finalidad del tratamiento', '3. Purpose of processing'),
            body: t(
              'Tratamos tus datos para gestionar tu cuenta y acceso al servicio, controlar el límite de generaciones según tu plan, mostrarte tu historial de uso, gestionar tu suscripción y enviarte comunicaciones sobre cambios importantes en el servicio.',
              'We process your data to manage your account and access to the service, control the generation limit according to your plan, show your usage history, manage your subscription and send you communications about important changes to the service.'
            ),
          },
          {
            title: t('4. Base legal del tratamiento', '4. Legal basis for processing'),
            body: t(
              'El tratamiento de tus datos se basa en la ejecución del contrato de prestación del servicio que aceptas al registrarte (art. 6.1.b RGPD) y, en su caso, en el consentimiento que otorgas al crear tu cuenta.',
              'The processing of your data is based on the performance of the service contract you accept upon registration (Art. 6.1.b GDPR) and, where applicable, on the consent you grant when creating your account.'
            ),
          },
          {
            title: t('5. Conservación de los datos', '5. Data retention'),
            body: t(
              'Conservamos tus datos mientras tu cuenta esté activa. Si eliminas tu cuenta, tus datos personales serán eliminados en un plazo máximo de 30 días, salvo obligación legal de conservación.',
              'We retain your data for as long as your account is active. If you delete your account, your personal data will be deleted within a maximum of 30 days, unless legally required to retain it.'
            ),
          },
          {
            title: t('6. Cesión de datos a terceros', '6. Sharing data with third parties'),
            body: t(
              'No vendemos ni cedemos tus datos a terceros con fines comerciales. Compartimos datos únicamente con los proveedores necesarios para prestar el servicio: Stripe (procesamiento de pagos), Neon (base de datos, servidores en Europa) y Vercel (hosting, servidores en EE.UU. con garantías adecuadas).',
              'We do not sell or share your data with third parties for commercial purposes. We share data only with the providers necessary to deliver the service: Stripe (payment processing), Neon (database, servers in Europe) and Vercel (hosting, servers in the US with adequate safeguards).'
            ),
          },
          {
            title: t('7. Transferencias internacionales', '7. International transfers'),
            body: t(
              'Algunos de nuestros proveedores (Vercel, Stripe) pueden tratar datos fuera del Espacio Económico Europeo. En estos casos, dichas transferencias se realizan con garantías adecuadas conforme al RGPD.',
              'Some of our providers (Vercel, Stripe) may process data outside the European Economic Area. In such cases, transfers are carried out with adequate safeguards in accordance with the GDPR.'
            ),
          },
          {
            title: t('8. Tus derechos', '8. Your rights'),
            body: t(
              'En virtud del RGPD, tienes derecho de acceso, rectificación, supresión, portabilidad, oposición y limitación del tratamiento. Para ejercer cualquiera de estos derechos, escríbenos a ytbeviral@gmail.com. También puedes presentar una reclamación ante la Agencia Española de Protección de Datos (aepd.es).',
              'Under the GDPR, you have the right of access, rectification, erasure, portability, objection and restriction of processing. To exercise any of these rights, write to us at ytbeviral@gmail.com. You may also lodge a complaint with the Spanish Data Protection Agency (aepd.es).'
            ),
          },
          {
            title: t('9. Cookies', '9. Cookies'),
            body: t(
              'YTubViral utiliza únicamente cookies técnicas estrictamente necesarias para el funcionamiento del servicio (gestión de sesión). No utilizamos cookies de seguimiento ni publicitarias.',
              'YTubViral uses only technically necessary cookies for the operation of the service (session management). We do not use tracking or advertising cookies.'
            ),
          },
          {
            title: t('10. Contacto', '10. Contact'),
            body: t('Para cualquier consulta sobre privacidad: ytbeviral@gmail.com', 'For any privacy enquiries: ytbeviral@gmail.com'),
          },
        ].map((s, i) => (
          <section key={i} className="space-y-3 pb-8 border-b border-white/5 last:border-0">
            <h2 className="font-display font-bold text-lg text-white">{s.title}</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">{s.body}</p>
          </section>
        ))}

        <div className="flex gap-5 font-mono-jb text-xs text-zinc-600 pt-4">
          <a href="/terms" className="hover:text-zinc-400 transition">{t('Términos', 'Terms')}</a>
          <a href="/legal" className="hover:text-zinc-400 transition">{t('Aviso Legal', 'Legal Notice')}</a>
          <a href="/" className="hover:text-zinc-400 transition">{t('Volver al inicio', 'Back to home')}</a>
        </div>
      </div>
    </div>
  );
}
