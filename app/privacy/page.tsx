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
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>LEGAL</p>
          <h1 className="font-display font-bold text-4xl text-white">{t('Política de Privacidad', 'Privacy Policy')}</h1>
          <p className="text-zinc-500 text-sm mt-2 font-mono-jb">{t('Última actualización: mayo de 2026', 'Last updated: May 2026')}</p>
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
            title: t('9. Extensión de Chrome — YTubViral para YouTube', '9. Chrome Extension — YTubViral for YouTube'),
            body: t(
              'La extensión de Chrome "YTubViral para YouTube" es una herramienta complementaria al servicio web. A continuación detallamos cómo gestiona los datos de usuario.',
              'The Chrome extension "YTubViral for YouTube" is a companion tool to the web service. Below we detail how it handles user data.'
            ),
          },
          {
            title: t('9.1. Datos que recoge la extensión', '9.1. Data collected by the extension'),
            body: t(
              'La extensión recoge y gestiona los siguientes datos: (a) Credenciales de inicio de sesión: tu email y contraseña se envían al servidor de YTubViral (ytubviral.com) para autenticarte; no se almacenan en texto plano, solo el token de sesión resultante. (b) Token de autenticación: se guarda en el almacenamiento local de la extensión (chrome.storage.local) para mantener tu sesión activa. (c) Preferencia de idioma: tu selección de idioma (español/inglés) se almacena localmente. (d) IDs de vídeos de YouTube: cuando visitas un vídeo o YouTube Studio, la extensión envía el ID del vídeo a nuestro servidor para obtener datos de análisis (SEO score, estadísticas del canal, keywords). (e) URLs de canales de YouTube: cuando visitas un canal, la extensión puede enviar el identificador del canal para obtener estadísticas. No recogemos tu historial de navegación general, datos personales adicionales, ni información de otros sitios web.',
              'The extension collects and handles the following data: (a) Login credentials: your email and password are sent to the YTubViral server (ytubviral.com) to authenticate you; they are not stored in plain text, only the resulting session token. (b) Authentication token: stored in the extension\'s local storage (chrome.storage.local) to keep your session active. (c) Language preference: your language selection (Spanish/English) is stored locally. (d) YouTube video IDs: when you visit a video or YouTube Studio, the extension sends the video ID to our server to retrieve analysis data (SEO score, channel stats, keywords). (e) YouTube channel URLs: when you visit a channel, the extension may send the channel identifier to get statistics. We do not collect your general browsing history, additional personal data, or information from other websites.'
            ),
          },
          {
            title: t('9.2. Permisos de la extensión', '9.2. Extension permissions'),
            body: t(
              'La extensión solicita los siguientes permisos: (a) "storage": para guardar tu token de sesión y preferencia de idioma localmente en tu navegador. (b) Acceso a youtube.com y studio.youtube.com: para inyectar los paneles de análisis SEO, estadísticas y herramientas directamente en las páginas de YouTube. (c) Acceso a ytubviral.com: para detectar si tienes sesión activa en la web y sincronizar el estado de login. La extensión no accede a ningún otro sitio web ni recoge datos de navegación fuera de estos dominios.',
              'The extension requests the following permissions: (a) "storage": to save your session token and language preference locally in your browser. (b) Access to youtube.com and studio.youtube.com: to inject SEO analysis panels, statistics and tools directly into YouTube pages. (c) Access to ytubviral.com: to detect if you have an active session on the web and sync login state. The extension does not access any other website or collect browsing data outside these domains.'
            ),
          },
          {
            title: t('9.3. Cómo se almacenan y comparten los datos de la extensión', '9.3. How extension data is stored and shared'),
            body: t(
              'Los datos locales (token, idioma) se almacenan exclusivamente en chrome.storage.local de tu navegador y no se transmiten a terceros. Los IDs de vídeos y canales se envían únicamente al servidor de YTubViral (ytubviral.com) a través de conexiones HTTPS cifradas para obtener los datos de análisis. No compartimos estos datos con terceros, no los usamos para publicidad y no los vendemos. Los datos de análisis obtenidos del servidor no se almacenan permanentemente en la extensión — se muestran en tiempo real y se descartan al cambiar de página.',
              'Local data (token, language) is stored exclusively in your browser\'s chrome.storage.local and is not transmitted to third parties. Video and channel IDs are sent only to the YTubViral server (ytubviral.com) via encrypted HTTPS connections to retrieve analysis data. We do not share this data with third parties, do not use it for advertising and do not sell it. Analysis data retrieved from the server is not permanently stored in the extension — it is displayed in real time and discarded when you navigate away.'
            ),
          },
          {
            title: t('9.4. Eliminación de datos de la extensión', '9.4. Deleting extension data'),
            body: t(
              'Puedes eliminar todos los datos almacenados por la extensión en cualquier momento cerrando sesión desde el popup de la extensión (esto borra el token y los datos de usuario) o desinstalando la extensión (esto elimina todos los datos de chrome.storage.local). Si eliminas tu cuenta de YTubViral, todos los datos asociados en nuestro servidor también se eliminarán.',
              'You can delete all data stored by the extension at any time by logging out from the extension popup (this deletes the token and user data) or by uninstalling the extension (this removes all chrome.storage.local data). If you delete your YTubViral account, all associated data on our server will also be deleted.'
            ),
          },
          {
            title: t('10. Cookies', '10. Cookies'),
            body: t(
              'YTubViral utiliza únicamente cookies técnicas estrictamente necesarias para el funcionamiento del servicio (gestión de sesión). No utilizamos cookies de seguimiento ni publicitarias.',
              'YTubViral uses only technically necessary cookies for the operation of the service (session management). We do not use tracking or advertising cookies.'
            ),
          },
          {
            title: t('11. Contacto', '11. Contact'),
            body: t('Para cualquier consulta sobre privacidad: ytbeviral@gmail.com', 'For any privacy enquiries: ytbeviral@gmail.com'),
          },
        ].map((s, i) => (
          <section key={i} className="space-y-3 pb-8 border-b border-white/5 last:border-0">
            <h2 className="font-display font-bold text-lg text-white">{s.title}</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">{s.body}</p>
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
