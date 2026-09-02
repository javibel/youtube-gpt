'use client';

import { useLang } from '@/components/LangProvider';

export default function PrivacyPage() {
  const lang = useLang();
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-10">

        <div>
          <a href="/" className="inline-flex items-center gap-1 mb-10">
            <svg width="14" height="14" viewBox="7 7 18 18" fill="none">
              <circle cx="16" cy="16" r="8" fill="#e84d5b"/>
            </svg>
            <span className="font-display font-bold text-[14px] text-white">YTubViral<span style={{ color: 'var(--red)' }}>.</span>com</span>
          </a>
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>LEGAL</p>
          <h1 className="font-display font-bold text-4xl text-white">{t('Política de Privacidad', 'Privacy Policy')}</h1>
          <p className="text-zinc-500 text-sm mt-2 font-mono-jb">{t('Última actualización: julio de 2026', 'Last updated: July 2026')}</p>
        </div>

        {[
          {
            title: t('1. Responsable del tratamiento', '1. Data controller'),
            body: t(
              'El responsable del tratamiento de los datos personales recogidos a través de YTubViral es Javier Jimeno Plata, con NIF 43444126R, domicilio en Barcelona, España. Email de contacto: privacy@ytubviral.com.',
              'The controller of personal data collected through YTubViral is Javier Jimeno Plata, Tax ID (NIF) 43444126R, based in Barcelona, Spain. Contact email: privacy@ytubviral.com.'
            ),
          },
          {
            title: t('2. Datos que recogemos', '2. Data we collect'),
            body: t(
              'Recogemos los siguientes datos para prestar el servicio:\n\n• Datos de registro: nombre y dirección de email.\n• Historial de generaciones: los textos que introduces (temas, títulos, etc.) y el contenido generado, para mostrarlos en tu dashboard.\n• Datos de suscripción: plan contratado, estado de la suscripción e identificador de cliente en Stripe.\n• Datos de YouTube: si conectas tu canal mediante OAuth, accedemos a datos analíticos del canal (vistas, suscriptores, rendimiento de vídeos) a través de los YouTube API Services. Este uso está sujeto a la Política de Privacidad de Google (https://policies.google.com/privacy) y a los Términos de Servicio de la API de YouTube (https://www.youtube.com/t/terms). Almacenamos tokens de acceso cifrados para mantener la conexión; puedes revocar el acceso en cualquier momento desde https://myaccount.google.com/permissions.\n• Dirección IP: almacenada temporalmente para control de límites de uso (rate limiting) y prevención de abuso. No se utiliza con fines de seguimiento.\n• Datos de navegación: preferencia de idioma (cookie técnica) y, solo con tu consentimiento, cookies de atribución de campañas (ver sección 11).\n\nLos datos de pago (tarjeta bancaria) son gestionados íntegramente por Stripe y no son accesibles para YTubViral.',
              'We collect the following data to provide the service:\n\n• Registration data: name and email address.\n• Generation history: the text you input (topics, titles, etc.) and the generated content, to display in your dashboard.\n• Subscription data: plan, subscription status and Stripe customer identifier.\n• YouTube data: if you connect your channel via OAuth, we access channel analytics data (views, subscribers, video performance) through YouTube API Services. This use is subject to the Google Privacy Policy (https://policies.google.com/privacy) and the YouTube API Terms of Service (https://www.youtube.com/t/terms). We store encrypted access tokens to maintain the connection; you can revoke access at any time at https://myaccount.google.com/permissions.\n• IP address: temporarily stored for rate limiting and abuse prevention. Not used for tracking purposes.\n• Browsing data: language preference (technical cookie) and, only with your consent, campaign attribution cookies (see section 11).\n\nPayment data (bank card details) is managed entirely by Stripe and is not accessible to YTubViral.'
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
              'El tratamiento de tus datos se basa en:\n\n• La ejecución del contrato de prestación del servicio que aceptas al registrarte (art. 6.1.b RGPD).\n• El interés legítimo en la prevención de fraude y abuso (art. 6.1.f RGPD) para el almacenamiento temporal de direcciones IP, y en la medición de audiencia básica sin cookies (estadísticas agregadas de páginas visitadas).\n• El consentimiento (art. 6.1.a RGPD) que otorgas al conectar tu cuenta de YouTube y al aceptar las cookies de atribución en el banner de cookies. Puedes revocarlo en cualquier momento (la conexión de YouTube desde tu perfil; las cookies desde el enlace "Cookies" del pie de página).',
              'The processing of your data is based on:\n\n• The performance of the service contract you accept upon registration (Art. 6.1.b GDPR).\n• Legitimate interest in fraud and abuse prevention (Art. 6.1.f GDPR) for the temporary storage of IP addresses, and in basic cookieless audience measurement (aggregate page-visit statistics).\n• Consent (Art. 6.1.a GDPR), which you grant when connecting your YouTube account and when accepting attribution cookies in the cookie banner. You may withdraw it at any time (YouTube connection from your profile; cookies via the "Cookies" link in the footer).'
            ),
          },
          {
            title: t('5. Procesamiento automatizado e IA', '5. Automated processing and AI'),
            body: t(
              'YTubViral utiliza modelos de inteligencia artificial de Anthropic (Claude) para generar contenido a partir de los textos que introduces. Los textos que envías son procesados por la API de Anthropic para generar las respuestas. Anthropic no utiliza los datos enviados a través de su API para entrenar sus modelos. Los resultados generados son orientativos y el usuario es responsable de revisarlos antes de su uso. Este procesamiento automatizado no produce efectos jurídicos ni le afecta significativamente de forma similar.\n\nGenerador de miniaturas: a partir del tema que describes, se genera un prompt de texto que se envía a Ideogram (EE.UU.) para crear la imagen de fondo. Si subes una foto personal, esta se compone con el fondo en nuestros propios servidores y NO se envía a Ideogram. Te recomendamos no incluir datos personales en el texto del tema, ya que dicho texto se procesa con proveedores de IA.',
              'YTubViral uses artificial intelligence models from Anthropic (Claude) to generate content from the text you input. The text you submit is processed by the Anthropic API to generate responses. Anthropic does not use data submitted through its API to train its models. Generated results are indicative and the user is responsible for reviewing them before use. This automated processing does not produce legal effects or similarly significantly affect the user.\n\nThumbnail generator: based on the topic you describe, a text prompt is generated and sent to Ideogram (US) to create the background image. If you upload a personal photo, it is composited with the background on our own servers and is NOT sent to Ideogram. We recommend not including personal data in the topic text, as that text is processed by AI providers.'
            ),
          },
          {
            title: t('6. Conservación de los datos', '6. Data retention'),
            body: t(
              'Conservamos tus datos mientras tu cuenta esté activa. Los períodos de retención específicos por tipo de dato son:\n\n• Datos de cuenta (email, nombre, preferencias): mientras la cuenta esté activa.\n• Historial de generaciones: mientras la cuenta esté activa.\n• Tokens de YouTube/Google: mientras la conexión esté activa; revocados inmediatamente al desconectar.\n• Datos de YouTube en caché: se actualizan o eliminan automáticamente en un máximo de 24 horas.\n• Datos de rate limiting (IPs): eliminados automáticamente tras 24 horas.\n• Datos de facturación: según obligación fiscal española (5 años).\n• Logs del servidor: 30 días.\n\nSi eliminas tu cuenta, todos tus datos personales, historial de generaciones y tokens de YouTube serán eliminados en un plazo máximo de 30 días, salvo obligación legal de conservación (datos fiscales).',
              'We retain your data for as long as your account is active. Specific retention periods by data type are:\n\n• Account data (email, name, preferences): while the account is active.\n• Generation history: while the account is active.\n• YouTube/Google tokens: while the connection is active; revoked immediately upon disconnection.\n• Cached YouTube data: automatically refreshed or deleted within a maximum of 24 hours.\n• Rate limiting data (IPs): automatically deleted after 24 hours.\n• Billing data: per Spanish tax obligations (5 years).\n• Server logs: 30 days.\n\nIf you delete your account, all your personal data, generation history and YouTube tokens will be deleted within a maximum of 30 days, unless legally required to retain it (tax data).'
            ),
          },
          {
            title: t('7. Cesión de datos a terceros', '7. Sharing data with third parties'),
            body: t(
              'No vendemos ni cedemos tus datos a terceros con fines comerciales. Compartimos datos únicamente con los proveedores necesarios para prestar el servicio:\n\n• Anthropic (generación de contenido con IA, servidores en EE.UU.).\n• Ideogram (generación de imágenes de miniaturas a partir de un prompt de texto, servidores en EE.UU.). Ideogram actúa como responsable independiente conforme a su propia política de privacidad; solo recibe el prompt de texto, no las fotos que subas.\n• Stripe (procesamiento de pagos, certificación PCI-DSS).\n• Google/YouTube Data API (datos analíticos del canal, si conectas tu cuenta).\n• Neon (base de datos PostgreSQL, servidores en Europa).\n• Vercel (hosting de la aplicación y almacenamiento de imágenes generadas, servidores en EE.UU. y Europa).\n• Resend (envío de emails transaccionales).\n• Cloudflare (DNS y enrutamiento de email).\n• Microsoft Clarity (grabación de sesiones y mapas de calor de la web, solo con tu consentimiento, servidores en EE.UU.).\n\nLas garantías de transferencia internacional aplicables a cada proveedor se detallan en la sección 8.',
              'We do not sell or share your data with third parties for commercial purposes. We share data only with the providers necessary to deliver the service:\n\n• Anthropic (AI content generation, servers in the US).\n• Ideogram (thumbnail image generation from a text prompt, servers in the US). Ideogram acts as an independent controller under its own privacy policy; it only receives the text prompt, not any photos you upload.\n• Stripe (payment processing, PCI-DSS certified).\n• Google/YouTube Data API (channel analytics data, if you connect your account).\n• Neon (PostgreSQL database, servers in Europe).\n• Vercel (application hosting and storage of generated images, servers in the US and Europe).\n• Resend (transactional email delivery).\n• Cloudflare (DNS and email routing).\n• Microsoft Clarity (session recordings and heatmaps for the website, only with your consent, servers in the US).\n\nThe international transfer safeguards applicable to each provider are detailed in section 8.'
            ),
          },
          {
            title: t('8. Transferencias internacionales', '8. International transfers'),
            body: t(
              'Varios de nuestros proveedores tratan datos fuera del Espacio Económico Europeo, principalmente en Estados Unidos. Estas son las garantías que aplica cada uno, verificadas a fecha de septiembre de 2026:\n\n• Anthropic: Cláusulas Contractuales Tipo (Módulos 2 y 3, Decisión 2021/914) incluidas en su Acuerdo de Tratamiento de Datos, además de adhesión al Marco de Privacidad de Datos UE-EE.UU.\n• Vercel: certificado en el Marco de Privacidad de Datos UE-EE.UU., con Cláusulas Contractuales Tipo como garantía adicional.\n• Stripe: certificado en el Marco de Privacidad de Datos UE-EE.UU. (y su extensión para Reino Unido y Suiza), con Cláusulas Contractuales Tipo como garantía adicional.\n• Google (YouTube API): Google LLC está certificado en el Marco de Privacidad de Datos UE-EE.UU.\n• Resend: Cláusulas Contractuales Tipo incluidas en su Acuerdo de Tratamiento de Datos.\n• Cloudflare: certificado en el Marco de Privacidad de Datos UE-EE.UU., con Cláusulas Contractuales Tipo como garantía de respaldo.\n• Neon: la base de datos reside en servidores de la Unión Europea. Al tratarse de una empresa estadounidense, su Acuerdo de Tratamiento de Datos incorpora el Marco de Privacidad de Datos UE-EE.UU. y las Cláusulas Contractuales Tipo para cualquier acceso desde fuera del EEE.\n• Microsoft (Clarity): Microsoft Corporation está certificada en el Marco de Privacidad de Datos UE-EE.UU., con Cláusulas Contractuales Tipo como garantía adicional.\n• Ideogram: recibe únicamente el texto del tema (prompt) para generar la imagen de fondo — nunca las fotos que subas, que se procesan exclusivamente en nuestros propios servidores. El servicio está diseñado para que ese texto no contenga datos personales, y por ello te pedimos expresamente que no los incluyas (ver sección 5). Ideogram actúa como responsable independiente conforme a su propia política de privacidad.\n\nPuedes solicitar más información sobre estas garantías, o una copia de los acuerdos de tratamiento de datos aplicables, escribiendo a privacy@ytubviral.com.',
              'Several of our providers process data outside the European Economic Area, mainly in the United States. These are the safeguards each one applies, verified as of September 2026:\n\n• Anthropic: Standard Contractual Clauses (Modules 2 and 3, Decision 2021/914) included in its Data Processing Addendum, in addition to EU-US Data Privacy Framework participation.\n• Vercel: certified under the EU-US Data Privacy Framework, with Standard Contractual Clauses as an additional safeguard.\n• Stripe: certified under the EU-US Data Privacy Framework (and its UK and Swiss extensions), with Standard Contractual Clauses as an additional safeguard.\n• Google (YouTube API): Google LLC is certified under the EU-US Data Privacy Framework.\n• Resend: Standard Contractual Clauses included in its Data Processing Addendum.\n• Cloudflare: certified under the EU-US Data Privacy Framework, with Standard Contractual Clauses as a fallback safeguard.\n• Neon: the database resides on servers in the European Union. As a US-based company, its Data Processing Agreement incorporates the EU-US Data Privacy Framework and Standard Contractual Clauses for any access from outside the EEA.\n• Microsoft (Clarity): Microsoft Corporation is certified under the EU-US Data Privacy Framework, with Standard Contractual Clauses as an additional safeguard.\n• Ideogram: only receives the topic text (prompt) to generate the background image — never any photos you upload, which are processed exclusively on our own servers. The service is designed so that this text contains no personal data, which is why we expressly ask you not to include any (see section 5). Ideogram acts as an independent controller under its own privacy policy.\n\nYou can request more information about these safeguards, or a copy of the applicable data processing agreements, by writing to privacy@ytubviral.com.'
            ),
          },
          {
            title: t('9. Tus derechos', '9. Your rights'),
            body: t(
              'En virtud del RGPD, tienes derecho de:\n\n• Acceso: solicitar una copia de tus datos personales.\n• Rectificación: corregir datos inexactos.\n• Supresión: solicitar la eliminación de tus datos.\n• Portabilidad: recibir tus datos en un formato estructurado.\n• Oposición: oponerte al tratamiento de tus datos.\n• Limitación: solicitar la limitación del tratamiento.\n• Revocación del consentimiento: retirar el consentimiento otorgado para la conexión de YouTube en cualquier momento.\n\nPara ejercer cualquiera de estos derechos, escríbenos a privacy@ytubviral.com. Responderemos en un plazo máximo de 30 días. También puedes presentar una reclamación ante la Agencia Española de Protección de Datos (aepd.es).',
              'Under the GDPR, you have the right to:\n\n• Access: request a copy of your personal data.\n• Rectification: correct inaccurate data.\n• Erasure: request the deletion of your data.\n• Portability: receive your data in a structured format.\n• Objection: object to the processing of your data.\n• Restriction: request the restriction of processing.\n• Withdrawal of consent: withdraw the consent granted for YouTube connection at any time.\n\nTo exercise any of these rights, write to us at privacy@ytubviral.com. We will respond within a maximum of 30 days. You may also lodge a complaint with the Spanish Data Protection Agency (aepd.es).'
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
              'YTubViral utiliza principalmente cookies propias (first-party). La única cookie de terceros es la de analítica de uso (Microsoft Clarity), y solo se instala con tu consentimiento — ver más abajo. No hay cookies publicitarias.\n\nCookies exentas de consentimiento (necesarias):\n• Cookie de sesión (next-auth): gestiona tu sesión de usuario autenticado.\n• Cookie de idioma (ytubviral_lang): almacena la preferencia de idioma que eliges explícitamente. Duración: 1 año.\n• Cookie de moneda (ytv_currency): almacena si los precios se muestran en euros o en dólares, deducido del país desde el que te conectas. Solo guarda el valor "eur" o "usd", no tu ubicación. Duración: 1 año.\n• Cookie de consentimiento (ytv_consent): recuerda tu decisión sobre cookies. Duración: 1 año si aceptas, 6 meses si rechazas.\n\nCookies de atribución (solo con tu consentimiento, vía el banner de cookies):\n• ytv_utm: registra de qué campaña llegaste (parámetros UTM de la URL de entrada). Duración: 30 días.\n• ytv_ref: registra el código de referido si llegas con un enlace de invitación. Duración: 1 hora.\n\nCookies de analítica de uso (solo con tu consentimiento, vía el banner de cookies):\n• Microsoft Clarity: analiza cómo navegas por la web (movimientos del ratón, clics, desplazamiento) mediante grabaciones de sesión y mapas de calor, para que podamos mejorar el producto. Por configuración, los campos de texto se enmascaran y no se graba su contenido. Duración: hasta 1 año. Más información: https://clarity.microsoft.com/terms\n\nSi rechazas, estas cookies de atribución y de analítica no se instalan y el servicio funciona exactamente igual. Puedes cambiar tu decisión en cualquier momento desde el enlace "Cookies" del pie de página. Además, usamos una medición de audiencia propia sin cookies (página visitada, referente, navegador y país, sin identificadores persistentes).',
              'YTubViral primarily uses first-party cookies. The only third-party cookie is for usage analytics (Microsoft Clarity), and it is only set with your consent — see below. There are no advertising cookies.\n\nCookies exempt from consent (necessary):\n• Session cookie (next-auth): manages your authenticated user session.\n• Language cookie (ytubviral_lang): stores the language preference you explicitly choose. Duration: 1 year.\n• Currency cookie (ytv_currency): stores whether prices are shown in euros or dollars, inferred from the country you connect from. It only stores the value "eur" or "usd", not your location. Duration: 1 year.\n• Consent cookie (ytv_consent): remembers your cookie decision. Duration: 1 year if accepted, 6 months if rejected.\n\nAttribution cookies (only with your consent, via the cookie banner):\n• ytv_utm: records which campaign you arrived from (UTM parameters in the landing URL). Duration: 30 days.\n• ytv_ref: records the referral code if you arrive through an invitation link. Duration: 1 hour.\n\nUsage analytics cookies (only with your consent, via the cookie banner):\n• Microsoft Clarity: analyzes how you navigate the site (mouse movement, clicks, scrolling) through session recordings and heatmaps, so we can improve the product. By configuration, text fields are masked and their content is not recorded. Duration: up to 1 year. More information: https://clarity.microsoft.com/terms\n\nIf you reject, these attribution and analytics cookies are not set and the service works exactly the same. You can change your decision at any time via the "Cookies" link in the footer. We also use first-party cookieless audience measurement (page visited, referrer, browser and country, with no persistent identifiers).'
            ),
          },
          {
            title: t('12. Seguridad', '12. Security'),
            body: t(
              'Implementamos medidas de seguridad técnicas y organizativas para proteger tus datos, incluyendo: cifrado HTTPS en todas las comunicaciones, hash de contraseñas con bcrypt (12 rondas), tokens de sesión seguros, rate limiting para prevenir ataques de fuerza bruta y acceso restringido a la base de datos. El procedimiento de actuación ante brechas de seguridad se detalla en la sección 13.',
              'We implement technical and organisational security measures to protect your data, including: HTTPS encryption for all communications, password hashing with bcrypt (12 rounds), secure session tokens, rate limiting to prevent brute force attacks and restricted database access. Our procedure for handling security breaches is detailed in section 13.'
            ),
          },
          {
            title: t('13. Notificación de brechas de seguridad', '13. Security breach notification'),
            body: t(
              'En caso de una violación de la seguridad de los datos personales (por ejemplo, acceso no autorizado, pérdida, alteración o divulgación de tus datos), actuaremos conforme a los artículos 33 y 34 del RGPD:\n\n• Notificación a la autoridad de control: cuando la brecha suponga un riesgo para tus derechos y libertades, la notificaremos a la Agencia Española de Protección de Datos (AEPD) sin dilación indebida y, siempre que sea posible, en un plazo máximo de 72 horas desde que tengamos constancia de ella. Si no fuera posible cumplir ese plazo, indicaremos los motivos de la demora.\n• Notificación a los afectados: cuando la brecha entrañe un alto riesgo para tus derechos y libertades, te lo comunicaremos directamente y sin dilación indebida, en un lenguaje claro y sencillo. Esta comunicación describirá la naturaleza de la brecha, sus posibles consecuencias, las medidas adoptadas o propuestas para resolverla y mitigar sus efectos, y un punto de contacto donde obtener más información (privacy@ytubviral.com).\n• Registro interno: documentamos todas las brechas de seguridad —incluidos los hechos relacionados, sus efectos y las medidas correctivas adoptadas— en un registro interno, con independencia de que deban o no notificarse.\n\nTe recomendamos mantener actualizada tu dirección de email para poder recibir estas comunicaciones a tiempo.',
              'In the event of a personal data breach (for example, unauthorised access, loss, alteration or disclosure of your data), we will act in accordance with Articles 33 and 34 of the GDPR:\n\n• Notification to the supervisory authority: where the breach poses a risk to your rights and freedoms, we will report it to the Spanish Data Protection Agency (AEPD) without undue delay and, where feasible, within a maximum of 72 hours of becoming aware of it. If this deadline cannot be met, we will state the reasons for the delay.\n• Notification to affected individuals: where the breach is likely to result in a high risk to your rights and freedoms, we will inform you directly and without undue delay, in clear and plain language. This communication will describe the nature of the breach, its likely consequences, the measures taken or proposed to address it and mitigate its effects, and a contact point for more information (privacy@ytubviral.com).\n• Internal record: we document all security breaches —including the related facts, their effects and the remedial action taken— in an internal register, regardless of whether they require notification.\n\nWe recommend keeping your email address up to date so you can receive these communications in good time.'
            ),
          },
          {
            title: t('14. Contacto', '14. Contact'),
            body: t(
              'Para cualquier consulta sobre privacidad: privacy@ytubviral.com',
              'For any privacy enquiries: privacy@ytubviral.com'
            ),
          },
        ].map((s, i) => (
          <section key={i} className="space-y-3 pb-8 last:pb-0 [&:not(:last-child)]:shadow-[inset_0_-1px_0_rgba(255,255,255,.05)]">
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
