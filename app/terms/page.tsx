'use client';

import { useLang } from '@/components/LangProvider';

export default function TermsPage() {
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
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>{t('LEGAL', 'LEGAL')}</p>
          <h1 className="font-display font-bold text-4xl text-white">{t('Términos y Condiciones', 'Terms and Conditions')}</h1>
          <p className="text-zinc-500 text-sm mt-2 font-mono-jb">{t('Última actualización: mayo de 2026', 'Last updated: May 2026')}</p>
        </div>

        {[
          {
            title: t('1. Identificación del servicio', '1. Service identification'),
            body: t(
              'YTubViral es un servicio web accesible en ytubviral.com que ofrece herramientas de generación y análisis de contenido asistidas por inteligencia artificial para creadores de contenido en YouTube. El servicio es gestionado por Javier Jimeno Plata, con domicilio en Barcelona, España. Contacto: legal@ytubviral.com.',
              'YTubViral is a web service accessible at ytubviral.com that offers AI-assisted content generation and analysis tools for YouTube content creators. The service is managed by Javier Jimeno Plata, based in Barcelona, Spain. Contact: legal@ytubviral.com.'
            ),
          },
          {
            title: t('2. Aceptación de los términos', '2. Acceptance of terms'),
            body: t(
              'El acceso y uso de YTubViral implica la aceptación plena y sin reservas de los presentes Términos y Condiciones. Si no está de acuerdo con alguno de los términos aquí establecidos, debe abstenerse de utilizar el servicio. El uso del servicio está restringido a personas mayores de 16 años. Al registrarse, el usuario declara tener al menos 16 años de edad.',
              'Accessing and using YTubViral implies full and unreserved acceptance of these Terms and Conditions. If you do not agree with any of the terms set out here, you must refrain from using the service. Use of the service is restricted to persons aged 16 or over. By registering, the user declares they are at least 16 years old.'
            ),
          },
          {
            title: t('3. Descripción del servicio', '3. Service description'),
            body: t(
              'YTubViral proporciona acceso a 14 herramientas de creación y análisis de contenido para YouTube, incluyendo: generador de títulos virales, scripts con IA, SEO score, keyword research, análisis de competidores, estimador de ingresos, A/B testing de títulos, mejor hora para publicar, calendario de contenido, análisis de retención, predictor de vídeos, AI coach, explorador de tendencias y centro de aprendizaje. El contenido se genera mediante modelos de inteligencia artificial de terceros (Anthropic Claude). También se ofrece una extensión de Chrome complementaria que permite acceder a algunas funcionalidades directamente desde YouTube. Los resultados generados por IA son orientativos y no constituyen asesoramiento profesional.',
              'YTubViral provides access to 14 content creation and analysis tools for YouTube, including: viral title generator, AI scripts, SEO score, keyword research, competitor analysis, revenue estimator, title A/B testing, best time to post, content calendar, retention analysis, video predictor, AI coach, trend explorer and learning hub. Content is generated using third-party artificial intelligence models (Anthropic Claude). A companion Chrome extension is also offered, allowing access to some features directly from YouTube. AI-generated results are indicative and do not constitute professional advice.'
            ),
          },
          {
            title: t('4. Planes y precios', '4. Plans and pricing'),
            body: t(
              'Plan gratuito: hasta 10 generaciones por mes natural, sin coste. Plan Pro: hasta 200 generaciones por mes natural, por un precio de 9,99 € al mes. Plan Business: generaciones ilimitadas, funcionalidades de equipo (hasta 5 miembros) y acceso prioritario, por un precio de 29,99 € al mes. Los planes de pago se renuevan automáticamente cada mes hasta que el usuario los cancele. Los precios pueden modificarse con un preaviso mínimo de 30 días comunicado por email. El plan Business incluye la posibilidad de crear un equipo e invitar a otros miembros, que compartirán la suscripción y los límites del plan.',
              'Free plan: up to 10 generations per calendar month, at no cost. Pro plan: up to 200 generations per calendar month, at a price of €9.99/month. Business plan: unlimited generations, team features (up to 5 members) and priority access, at a price of €29.99/month. Paid plans renew automatically each month until cancelled by the user. Prices may be modified with a minimum notice of 30 days communicated by email. The Business plan includes the ability to create a team and invite other members, who will share the subscription and plan limits.'
            ),
          },
          {
            title: t('5. Pagos, cancelaciones y derecho de desistimiento', '5. Payments, cancellations and right of withdrawal'),
            body: t(
              'Los pagos se procesan a través de Stripe, proveedor externo de servicios de pago. YTubViral no almacena datos de tarjetas bancarias. El usuario puede cancelar su suscripción en cualquier momento desde su panel de usuario. La cancelación tendrá efecto al finalizar el periodo de facturación en curso.\n\nDerecho de desistimiento: conforme a la Directiva 2011/83/UE, el usuario dispone de un plazo de 14 días naturales desde la contratación para desistir del servicio sin necesidad de justificación. No obstante, si el usuario ha comenzado a utilizar el servicio (realizando generaciones de contenido) durante dicho plazo, acepta que el servicio ha comenzado a prestarse y renuncia expresamente al derecho de desistimiento en la parte proporcional del servicio ya consumido. Para ejercer el derecho de desistimiento, el usuario puede contactar a legal@ytubviral.com.',
              'Payments are processed through Stripe, a third-party payment service provider. YTubViral does not store bank card details. The user may cancel their subscription at any time from their dashboard. Cancellation takes effect at the end of the current billing period.\n\nRight of withdrawal: in accordance with Directive 2011/83/EU, the user has a period of 14 calendar days from the date of purchase to withdraw from the service without giving any reason. However, if the user has begun using the service (by generating content) during that period, the user agrees that the service has started and expressly waives the right of withdrawal for the proportion of the service already consumed. To exercise the right of withdrawal, the user may contact legal@ytubviral.com.'
            ),
          },
          {
            title: t('6. Uso aceptable', '6. Acceptable use'),
            body: t(
              'El usuario se compromete a utilizar YTubViral de forma lícita. Queda prohibido usar el servicio para generar contenido ilegal, difamatorio, que incite al odio o fraudulento; intentar eludir los límites técnicos; revender el servicio sin autorización; o usarlo de forma automatizada masiva (scraping, bots). YTubViral se reserva el derecho a suspender o cancelar cuentas que incumplan estas condiciones, con notificación previa al usuario salvo en casos de uso claramente ilegal.',
              'The user agrees to use YTubViral lawfully. It is prohibited to use the service to generate illegal, defamatory, hate-inciting or fraudulent content; attempt to circumvent technical limits; resell the service without authorisation; or use it in a massive automated manner (scraping, bots). YTubViral reserves the right to suspend or cancel accounts that violate these conditions, with prior notification to the user except in cases of clearly illegal use.'
            ),
          },
          {
            title: t('7. Conexión con YouTube', '7. YouTube connection'),
            body: t(
              'Algunas funcionalidades de YTubViral requieren conectar una cuenta de YouTube mediante OAuth 2.0 (protocolo de autorización de Google). Al conectar tu canal, YTubViral accede a datos públicos y analíticos de tu canal a través de la YouTube Data API. Este acceso está sujeto a los Términos de Servicio de la API de YouTube (https://developers.google.com/youtube/terms/api-services-terms-of-service) y a la Política de Privacidad de Google (https://policies.google.com/privacy). El usuario puede revocar el acceso en cualquier momento desde la configuración de permisos de su cuenta de Google (https://myaccount.google.com/permissions).',
              'Some YTubViral features require connecting a YouTube account via OAuth 2.0 (Google\'s authorisation protocol). By connecting your channel, YTubViral accesses public and analytics data from your channel through the YouTube Data API. This access is subject to the YouTube API Terms of Service (https://developers.google.com/youtube/terms/api-services-terms-of-service) and Google\'s Privacy Policy (https://policies.google.com/privacy). The user may revoke access at any time from their Google account permissions (https://myaccount.google.com/permissions).'
            ),
          },
          {
            title: t('8. Propiedad intelectual del contenido generado', '8. Intellectual property of generated content'),
            body: t(
              'El contenido generado a través de YTubViral es propiedad del usuario que lo genera. YTubViral no reclama derechos sobre dicho contenido. No obstante, el usuario es el único responsable del uso que haga del contenido generado y de asegurar que no infringe derechos de terceros.',
              'Content generated through YTubViral is owned by the user who generates it. YTubViral claims no rights over such content. However, the user is solely responsible for the use made of the generated content and for ensuring it does not infringe third-party rights.'
            ),
          },
          {
            title: t('9. Eliminación de cuenta', '9. Account deletion'),
            body: t(
              'El usuario puede solicitar la eliminación de su cuenta y todos los datos asociados contactando a legal@ytubviral.com. Tras la solicitud, los datos personales serán eliminados en un plazo máximo de 30 días. El historial de generaciones y los datos de uso se eliminarán de forma permanente. Si el usuario tiene una suscripción activa, deberá cancelarla previamente.',
              'The user may request the deletion of their account and all associated data by contacting legal@ytubviral.com. Following the request, personal data will be deleted within a maximum of 30 days. Generation history and usage data will be permanently deleted. If the user has an active subscription, it must be cancelled beforehand.'
            ),
          },
          {
            title: t('10. Enlaces de afiliados', '10. Affiliate links'),
            body: t(
              'La sección "Equipo recomendado" (/gear) de YTubViral contiene enlaces de afiliados a Amazon Associates. Si realizas una compra a través de estos enlaces, YTubViral puede recibir una comisión sin coste adicional para ti. Los productos son recomendaciones editoriales y no constituyen un compromiso de calidad por parte de YTubViral.',
              'The "Recommended Gear" section (/gear) on YTubViral contains affiliate links to Amazon Associates. If you make a purchase through these links, YTubViral may receive a commission at no additional cost to you. Products are editorial recommendations and do not constitute a quality commitment by YTubViral.'
            ),
          },
          {
            title: t('11. Limitación de responsabilidad', '11. Limitation of liability'),
            body: t(
              'YTubViral se ofrece "tal cual" y no garantiza que el servicio sea ininterrumpido o libre de errores. El contenido generado por modelos de IA puede contener inexactitudes y no debe utilizarse como única fuente de información. YTubViral no será responsable de pérdidas de ingresos, daños indirectos o pérdida de datos. La responsabilidad máxima no excederá el importe abonado por el usuario en los tres meses anteriores al hecho que origina la reclamación.',
              'YTubViral is provided "as is" and does not guarantee that the service will be uninterrupted or error-free. Content generated by AI models may contain inaccuracies and should not be used as the sole source of information. YTubViral shall not be liable for loss of revenue, indirect damages or data loss. Maximum liability shall not exceed the amount paid by the user in the three months prior to the claim.'
            ),
          },
          {
            title: t('12. Modificaciones del servicio y de estos términos', '12. Service and terms modifications'),
            body: t(
              'YTubViral se reserva el derecho a modificar, suspender o interrumpir el servicio en cualquier momento. En caso de cambios sustanciales en los precios o condiciones, se notificará al usuario con al menos 30 días de antelación por email. El uso continuado del servicio tras la modificación implica la aceptación de los nuevos términos.',
              'YTubViral reserves the right to modify, suspend or discontinue the service at any time. In the event of substantial changes to prices or conditions, the user will be notified at least 30 days in advance by email. Continued use of the service after modification implies acceptance of the new terms.'
            ),
          },
          {
            title: t('13. Ley aplicable y jurisdicción', '13. Applicable law and jurisdiction'),
            body: t(
              'Los presentes términos se rigen por la legislación española y la normativa de la Unión Europea aplicable. Para cualquier controversia, ambas partes se someten a los juzgados y tribunales competentes conforme a la normativa española vigente, sin perjuicio de los derechos que la normativa de protección de consumidores pueda otorgar al usuario.',
              'These terms are governed by Spanish law and applicable European Union regulations. For any dispute, both parties submit to the competent courts in accordance with current Spanish regulations, without prejudice to any rights that consumer protection regulations may grant the user.'
            ),
          },
          {
            title: t('14. Contacto', '14. Contact'),
            body: t(
              'Para cualquier consulta sobre estos términos: legal@ytubviral.com',
              'For any questions about these terms: legal@ytubviral.com'
            ),
          },
        ].map((s, i) => (
          <section key={i} className="space-y-3 pb-8 border-b border-white/5 last:border-0">
            <h2 className="font-display font-bold text-lg text-white">{s.title}</h2>
            <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-line">{s.body}</p>
          </section>
        ))}

        <div className="flex gap-5 font-mono-jb text-[13px] text-zinc-600 pt-4">
          <a href="/privacy" className="hover:text-zinc-400 transition">{t('Privacidad', 'Privacy')}</a>
          <a href="/legal" className="hover:text-zinc-400 transition">{t('Aviso Legal', 'Legal Notice')}</a>
          <a href="/" className="hover:text-zinc-400 transition">{t('Volver al inicio', 'Back to home')}</a>
        </div>
      </div>
    </div>
  );
}
