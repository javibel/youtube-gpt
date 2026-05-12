'use client';

import { useState, useEffect } from 'react';
import { getLangClient } from '@/lib/get-lang-client';

export default function PrivacyPage() {
  const [lang, setLang] = useState<'es'|'en'>('es');
  useEffect(() => { setLang(getLangClient()); }, []);
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-10">

        <div>
          <a href="/" className="inline-flex items-center gap-2 mb-10">
            <svg width="14" height="14" viewBox="7 7 18 18" fill="none">
              <circle cx="16" cy="16" r="8" fill="#ee4d5e"/>
            </svg>
            <span className="font-display font-bold text-[14px] text-white">YTubViral<span style={{ color: 'var(--red)' }}>.</span>com</span>
          </a>
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>LEGAL</p>
          <h1 className="font-display font-bold text-4xl text-white">{t('Política de Privacidad', 'Privacy Policy')}</h1>
          <p className="text-zinc-500 text-sm mt-2 font-mono-jb">{t('Última actualización: mayo de 2026', 'Last updated: May 2026')}</p>
        </div>

        {[
          {
            title: t('1. Responsable del tratamiento', '1. Data controller'),
            body: t(
              'El responsable del tratamiento de los datos personales recogidos a través de YTubViral es Javier Jimeno Plata, con domicilio en Barcelona, España. Email de contacto: hello@ytubviral.com.',
              'The controller of personal data collected through YTubViral is Javier Jimeno Plata, based in Barcelona, Spain. Contact email: hello@ytubviral.com.'
            ),
          },
          {
            title: t('2. Datos que recogemos', '2. Data we collect'),
            body: t(
              'Recogemos los siguientes datos para prestar el servicio:\n\n• Datos de registro: nombre y dirección de email.\n• Historial de generaciones: los textos que introduces (temas, títulos, etc.) y el contenido generado, para mostrarlos en tu dashboard.\n• Datos de suscripción: plan contratado, estado de la suscripción e identificador de cliente en Stripe.\n• Datos de YouTube: si conectas tu canal mediante OAuth, accedemos a datos analíticos del canal (vistas, suscriptores, rendimiento de vídeos) a través de la YouTube Data API. Almacenamos tokens de acceso cifrados para mantener la conexión.\n• Dirección IP: almacenada temporalmente para control de límites de uso (rate limiting) y prevención de abuso. No se utiliza con fines de seguimiento.\n• Datos de navegación: preferencia de idioma (cookie técnica).\n\nLos datos de pago (tarjeta bancaria) son gestionados íntegramente por Stripe y no son accesibles para YTubViral.',
              'We collect the following data to provide the service:\n\n• Registration data: name and email address.\n• Generation history: the text you input (topics, titles, etc.) and the generated content, to display in your dashboard.\n• Subscription data: plan, subscription status and Stripe customer identifier.\n• YouTube data: if you connect your channel via OAuth, we access channel analytics data (views, subscribers, video performance) through the YouTube Data API. We store encrypted access tokens to maintain the connection.\n• IP address: temporarily stored for rate limiting and abuse prevention. Not used for tracking purposes.\n• Browsing data: language preference (technical cookie).\n\nPayment data (bank card details) is managed entirely by Stripe and is not accessible to YTubViral.'
            ),
          },
          {
            title: t('3. Finalidad del tratamiento', '3. Purpose of processing'),
            body: t(
              'Tratamos tus datos para:\n\n• Gestionar tu cuenta y acceso al servicio.\n• Generar contenido mediante modelos de IA a partir de los textos que introduces.\n• Controlar el límite de generaciones según tu plan.\n• Mostrarte tu historial de uso y analíticas de tu canal.\n• Gestionar tu suscripción y procesar pagos.\n• Enviarte comunicaciones transaccionales (confirmación de registro, cambio de contraseña, notificaciones de servicio).\n• Prevenir el abuso del servicio mediante rate limiting.',
              'We process your data to:\n\n• Manage your account and access to the service.\n• Generate content using AI models based on the text you input.\n• Control the generation limit according to your plan.\n• Show your usage history and channel analytics.\n• Manage your subscription and process payments.\n• Send you transactional communications (registration confirmation, password changes, service notifications).\n• Prevent service abuse through rate limiting.'
            ),
          },
          {
            title: t('4. Base legal del tratamiento', '4. Legal basis for processing'),
            body: t(
              'El tratamiento de tus datos se basa en:\n\n• La ejecución del contrato de prestación del servicio que aceptas al registrarte (art. 6.1.b RGPD).\n• El interés legítimo en la prevención de fraude y abuso (art. 6.1.f RGPD) para el almacenamiento temporal de direcciones IP.\n• El consentimiento que otorgas al conectar tu cuenta de YouTube (art. 6.1.a RGPD), que puedes revocar en cualquier momento.',
              'The processing of your data is based on:\n\n• The performance of the service contract you accept upon registration (Art. 6.1.b GDPR).\n• Legitimate interest in fraud and abuse prevention (Art. 6.1.f GDPR) for the temporary storage of IP addresses.\n• The consent you grant when connecting your YouTube account (Art. 6.1.a GDPR), which you may revoke at any time.'
            ),
          },
          {
            title: t('5. Procesamiento automatizado e IA', '5. Automated processing and AI'),
            body: t(
              'YTubViral utiliza modelos de inteligencia artificial de Anthropic (Claude) para generar contenido a partir de los textos que introduces. Los textos que envías son procesados por la API de Anthropic para generar las respuestas. Anthropic no utiliza los datos enviados a través de su API para entrenar sus modelos. Los resultados generados son orientativos y el usuario es responsable de revisarlos antes de su uso. Este procesamiento automatizado no produce efectos jurídicos ni le afecta significativamente de forma similar.',
              'YTubViral uses artificial intelligence models from Anthropic (Claude) to generate content from the text you input. The text you submit is processed by the Anthropic API to generate responses. Anthropic does not use data submitted through its API to train its models. Generated results are indicative and the user is responsible for reviewing them before use. This automated processing does not produce legal effects or similarly significantly affect the user.'
            ),
          },
          {
            title: t('6. Conservación de los datos', '6. Data retention'),
            body: t(
              'Conservamos tus datos mientras tu cuenta esté activa. Los períodos de retención específicos por tipo de dato son:\n\n• Datos de cuenta (email, nombre, preferencias): mientras la cuenta esté activa.\n• Historial de generaciones: mientras la cuenta esté activa.\n• Tokens de YouTube/Google: mientras la conexión esté activa; revocados inmediatamente al desconectar.\n• Datos de rate limiting (IPs): eliminados automáticamente tras 24 horas.\n• Datos de facturación: según obligación fiscal española (5 años).\n• Logs del servidor: 30 días.\n\nSi eliminas tu cuenta, todos tus datos personales, historial de generaciones y tokens de YouTube serán eliminados en un plazo máximo de 30 días, salvo obligación legal de conservación (datos fiscales).',
              'We retain your data for as long as your account is active. Specific retention periods by data type are:\n\n• Account data (email, name, preferences): while the account is active.\n• Generation history: while the account is active.\n• YouTube/Google tokens: while the connection is active; revoked immediately upon disconnection.\n• Rate limiting data (IPs): automatically deleted after 24 hours.\n• Billing data: per Spanish tax obligations (5 years).\n• Server logs: 30 days.\n\nIf you delete your account, all your personal data, generation history and YouTube tokens will be deleted within a maximum of 30 days, unless legally required to retain it (tax data).'
            ),
          },
          {
            title: t('7. Cesión de datos a terceros', '7. Sharing data with third parties'),
            body: t(
              'No vendemos ni cedemos tus datos a terceros con fines comerciales. Compartimos datos únicamente con los proveedores necesarios para prestar el servicio:\n\n• Anthropic (generación de contenido con IA, servidores en EE.UU.).\n• Stripe (procesamiento de pagos, certificación PCI-DSS).\n• Google/YouTube Data API (datos analíticos del canal, si conectas tu cuenta).\n• Neon (base de datos PostgreSQL, servidores en Europa).\n• Vercel (hosting de la aplicación, servidores en EE.UU. y Europa).\n• Resend (envío de emails transaccionales).\n• Cloudflare (DNS y enrutamiento de email).\n\nTodos los proveedores están sujetos a sus respectivas políticas de privacidad y ofrecen garantías adecuadas para la protección de datos.',
              'We do not sell or share your data with third parties for commercial purposes. We share data only with the providers necessary to deliver the service:\n\n• Anthropic (AI content generation, servers in the US).\n• Stripe (payment processing, PCI-DSS certified).\n• Google/YouTube Data API (channel analytics data, if you connect your account).\n• Neon (PostgreSQL database, servers in Europe).\n• Vercel (application hosting, servers in the US and Europe).\n• Resend (transactional email delivery).\n• Cloudflare (DNS and email routing).\n\nAll providers are subject to their respective privacy policies and offer adequate data protection safeguards.'
            ),
          },
          {
            title: t('8. Transferencias internacionales', '8. International transfers'),
            body: t(
              'Algunos de nuestros proveedores (Anthropic, Vercel, Stripe, Resend) pueden tratar datos fuera del Espacio Económico Europeo, principalmente en Estados Unidos. En estos casos, dichas transferencias se realizan con garantías adecuadas conforme al RGPD, incluyendo el Marco de Privacidad de Datos UE-EE.UU. (EU-US Data Privacy Framework) cuando aplique.',
              'Some of our providers (Anthropic, Vercel, Stripe, Resend) may process data outside the European Economic Area, primarily in the United States. In such cases, transfers are carried out with adequate safeguards in accordance with the GDPR, including the EU-US Data Privacy Framework where applicable.'
            ),
          },
          {
            title: t('9. Tus derechos', '9. Your rights'),
            body: t(
              'En virtud del RGPD, tienes derecho de:\n\n• Acceso: solicitar una copia de tus datos personales.\n• Rectificación: corregir datos inexactos.\n• Supresión: solicitar la eliminación de tus datos.\n• Portabilidad: recibir tus datos en un formato estructurado.\n• Oposición: oponerte al tratamiento de tus datos.\n• Limitación: solicitar la limitación del tratamiento.\n• Revocación del consentimiento: retirar el consentimiento otorgado para la conexión de YouTube en cualquier momento.\n\nPara ejercer cualquiera de estos derechos, escríbenos a hello@ytubviral.com. Responderemos en un plazo máximo de 30 días. También puedes presentar una reclamación ante la Agencia Española de Protección de Datos (aepd.es).',
              'Under the GDPR, you have the right to:\n\n• Access: request a copy of your personal data.\n• Rectification: correct inaccurate data.\n• Erasure: request the deletion of your data.\n• Portability: receive your data in a structured format.\n• Objection: object to the processing of your data.\n• Restriction: request the restriction of processing.\n• Withdrawal of consent: withdraw the consent granted for YouTube connection at any time.\n\nTo exercise any of these rights, write to us at hello@ytubviral.com. We will respond within a maximum of 30 days. You may also lodge a complaint with the Spanish Data Protection Agency (aepd.es).'
            ),
          },
          {
            title: t('10. Extensión de Chrome — YTubViral para YouTube', '10. Chrome Extension — YTubViral for YouTube'),
            body: t(
              'La extensión de Chrome "YTubViral para YouTube" es una herramienta complementaria al servicio web. A continuación detallamos cómo gestiona los datos de usuario.',
              'The Chrome extension "YTubViral for YouTube" is a companion tool to the web service. Below we detail how it handles user data.'
            ),
          },
          {
            title: t('10.1. Datos que recoge la extensión', '10.1. Data collected by the extension'),
            body: t(
              'La extensión recoge y gestiona los siguientes datos:\n\n• Credenciales de inicio de sesión: tu email y contraseña se envían al servidor de YTubViral (ytubviral.com) para autenticarte; no se almacenan en texto plano, solo el token de sesión resultante.\n• Token de autenticación: se guarda en el almacenamiento local de la extensión (chrome.storage.local) para mantener tu sesión activa.\n• Preferencia de idioma: tu selección de idioma (español/inglés) se almacena localmente.\n• IDs de vídeos de YouTube: cuando visitas un vídeo o YouTube Studio, la extensión envía el ID del vídeo a nuestro servidor para obtener datos de análisis (SEO score, estadísticas del canal, keywords).\n• URLs de canales de YouTube: cuando visitas un canal, la extensión puede enviar el identificador del canal para obtener estadísticas.\n\nNo recogemos tu historial de navegación general, datos personales adicionales, ni información de otros sitios web.',
              'The extension collects and handles the following data:\n\n• Login credentials: your email and password are sent to the YTubViral server (ytubviral.com) to authenticate you; they are not stored in plain text, only the resulting session token.\n• Authentication token: stored in the extension\'s local storage (chrome.storage.local) to keep your session active.\n• Language preference: your language selection (Spanish/English) is stored locally.\n• YouTube video IDs: when you visit a video or YouTube Studio, the extension sends the video ID to our server to retrieve analysis data (SEO score, channel stats, keywords).\n• YouTube channel URLs: when you visit a channel, the extension may send the channel identifier to get statistics.\n\nWe do not collect your general browsing history, additional personal data, or information from other websites.'
            ),
          },
          {
            title: t('10.2. Permisos de la extensión', '10.2. Extension permissions'),
            body: t(
              'La extensión solicita los siguientes permisos:\n\n• "storage": para guardar tu token de sesión y preferencia de idioma localmente en tu navegador.\n• Acceso a youtube.com y studio.youtube.com: para inyectar los paneles de análisis SEO, estadísticas y herramientas directamente en las páginas de YouTube.\n• Acceso a ytubviral.com: para detectar si tienes sesión activa en la web y sincronizar el estado de login.\n\nLa extensión no accede a ningún otro sitio web ni recoge datos de navegación fuera de estos dominios.',
              'The extension requests the following permissions:\n\n• "storage": to save your session token and language preference locally in your browser.\n• Access to youtube.com and studio.youtube.com: to inject SEO analysis panels, statistics and tools directly into YouTube pages.\n• Access to ytubviral.com: to detect if you have an active session on the web and sync login state.\n\nThe extension does not access any other website or collect browsing data outside these domains.'
            ),
          },
          {
            title: t('10.3. Almacenamiento y cesión de datos de la extensión', '10.3. Extension data storage and sharing'),
            body: t(
              'Los datos locales (token, idioma) se almacenan exclusivamente en chrome.storage.local de tu navegador y no se transmiten a terceros. Los IDs de vídeos y canales se envían únicamente al servidor de YTubViral (ytubviral.com) a través de conexiones HTTPS cifradas para obtener los datos de análisis. No compartimos estos datos con terceros, no los usamos para publicidad y no los vendemos. Los datos de análisis obtenidos del servidor no se almacenan permanentemente en la extensión — se muestran en tiempo real y se descartan al cambiar de página.',
              'Local data (token, language) is stored exclusively in your browser\'s chrome.storage.local and is not transmitted to third parties. Video and channel IDs are sent only to the YTubViral server (ytubviral.com) via encrypted HTTPS connections to retrieve analysis data. We do not share this data with third parties, do not use it for advertising and do not sell it. Analysis data retrieved from the server is not permanently stored in the extension — it is displayed in real time and discarded when you navigate away.'
            ),
          },
          {
            title: t('10.4. Eliminación de datos de la extensión', '10.4. Deleting extension data'),
            body: t(
              'Puedes eliminar todos los datos almacenados por la extensión en cualquier momento cerrando sesión desde el popup de la extensión (esto borra el token y los datos de usuario) o desinstalando la extensión (esto elimina todos los datos de chrome.storage.local). Si eliminas tu cuenta de YTubViral, todos los datos asociados en nuestro servidor también se eliminarán.',
              'You can delete all data stored by the extension at any time by logging out from the extension popup (this deletes the token and user data) or by uninstalling the extension (this removes all chrome.storage.local data). If you delete your YTubViral account, all associated data on our server will also be deleted.'
            ),
          },
          {
            title: t('11. Cookies', '11. Cookies'),
            body: t(
              'YTubViral utiliza únicamente cookies técnicas estrictamente necesarias para el funcionamiento del servicio:\n\n• Cookie de sesión (next-auth): gestiona tu sesión de usuario autenticado.\n• Cookie de idioma (ytubviral_lang): almacena tu preferencia de idioma (español o inglés).\n\nNo utilizamos cookies de seguimiento, analíticas ni publicitarias. Al ser cookies estrictamente necesarias, no requieren consentimiento previo conforme a la normativa de cookies.',
              'YTubViral uses only technically necessary cookies for the operation of the service:\n\n• Session cookie (next-auth): manages your authenticated user session.\n• Language cookie (ytubviral_lang): stores your language preference (Spanish or English).\n\nWe do not use tracking, analytics or advertising cookies. As strictly necessary cookies, they do not require prior consent under cookie regulations.'
            ),
          },
          {
            title: t('12. Seguridad', '12. Security'),
            body: t(
              'Implementamos medidas de seguridad técnicas y organizativas para proteger tus datos, incluyendo: cifrado HTTPS en todas las comunicaciones, hash de contraseñas con bcrypt (12 rondas), tokens de sesión seguros, rate limiting para prevenir ataques de fuerza bruta y acceso restringido a la base de datos. En caso de brecha de seguridad que afecte a tus datos personales, te notificaremos y comunicaremos a la autoridad competente en un plazo de 72 horas conforme al art. 33 del RGPD.',
              'We implement technical and organisational security measures to protect your data, including: HTTPS encryption for all communications, password hashing with bcrypt (12 rounds), secure session tokens, rate limiting to prevent brute force attacks and restricted database access. In the event of a security breach affecting your personal data, we will notify you and report to the relevant authority within 72 hours in accordance with Art. 33 of the GDPR.'
            ),
          },
          {
            title: t('13. Contacto', '13. Contact'),
            body: t(
              'Para cualquier consulta sobre privacidad: hello@ytubviral.com',
              'For any privacy enquiries: hello@ytubviral.com'
            ),
          },
        ].map((s, i) => (
          <section key={i} className="space-y-3 pb-8 border-b border-white/5 last:border-0">
            <h2 className="font-display font-bold text-lg text-white">{s.title}</h2>
            <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-line">{s.body}</p>
          </section>
        ))}

        <div className="flex gap-5 font-mono-jb text-[13px] text-zinc-600 pt-4">
          <a href="/terms" className="hover:text-zinc-400 transition">{t('Términos', 'Terms')}</a>
          <a href="/legal" className="hover:text-zinc-400 transition">{t('Aviso Legal', 'Legal Notice')}</a>
          <a href="/" className="hover:text-zinc-400 transition">{t('Volver al inicio', 'Back to home')}</a>
        </div>
      </div>
    </div>
  );
}
