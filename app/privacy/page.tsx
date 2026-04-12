export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-300 px-4 py-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Política de Privacidad</h1>
          <p className="text-gray-500 text-sm mt-2">Última actualización: abril de 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">1. Responsable del tratamiento</h2>
          <p>El responsable del tratamiento de los datos personales recogidos a través de YTubViral es un particular con domicilio en España, contactable en <strong>ytbeviral@gmail.com</strong>.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">2. Datos que recogemos</h2>
          <p>Recogemos únicamente los datos necesarios para prestar el servicio:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Nombre y dirección de email</strong> — proporcionados al registrarse.</li>
            <li><strong>Historial de generaciones</strong> — los inputs que introduces y el contenido generado, para mostrar tu historial en el dashboard.</li>
            <li><strong>Datos de suscripción</strong> — plan contratado y estado. Los datos de pago son gestionados íntegramente por Stripe y no son accesibles para YTubViral.</li>
          </ul>
          <p>No recogemos tu clave de API de Anthropic. Esta se transmite directamente desde tu navegador para realizar la generación y no se almacena en nuestros servidores.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">3. Finalidad del tratamiento</h2>
          <p>Tratamos tus datos para:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Gestionar tu cuenta y acceso al servicio.</li>
            <li>Controlar el límite de generaciones según tu plan.</li>
            <li>Mostrarte tu historial de uso en el dashboard.</li>
            <li>Gestionar tu suscripción y comunicaciones relacionadas con el pago.</li>
            <li>Enviarte comunicaciones sobre cambios importantes en el servicio.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">4. Base legal del tratamiento</h2>
          <p>El tratamiento de tus datos se basa en la ejecución del contrato de prestación del servicio que aceptas al registrarte (art. 6.1.b RGPD) y, en su caso, en el consentimiento que otorgas al crear tu cuenta.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">5. Conservación de los datos</h2>
          <p>Conservamos tus datos mientras tu cuenta esté activa. Si eliminas tu cuenta, tus datos personales serán eliminados en un plazo máximo de 30 días, salvo obligación legal de conservación.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">6. Cesión de datos a terceros</h2>
          <p>No vendemos ni cedemos tus datos a terceros con fines comerciales. Compartimos datos únicamente con los proveedores necesarios para prestar el servicio:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Stripe</strong> — procesamiento de pagos (política de privacidad en stripe.com/es/privacy).</li>
            <li><strong>Neon</strong> — almacenamiento de base de datos (servidores en Europa).</li>
            <li><strong>Vercel</strong> — infraestructura de hosting (servidores en EE.UU. con garantías adecuadas).</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">7. Transferencias internacionales</h2>
          <p>Algunos de nuestros proveedores (Vercel, Stripe) pueden tratar datos fuera del Espacio Económico Europeo. En estos casos, dichas transferencias se realizan con garantías adecuadas conforme al RGPD (cláusulas contractuales tipo u otras medidas equivalentes).</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">8. Tus derechos</h2>
          <p>En virtud del RGPD, tienes derecho a:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Acceso</strong> — conocer qué datos tenemos sobre ti.</li>
            <li><strong>Rectificación</strong> — corregir datos inexactos.</li>
            <li><strong>Supresión</strong> — solicitar la eliminación de tus datos.</li>
            <li><strong>Portabilidad</strong> — recibir tus datos en formato estructurado.</li>
            <li><strong>Oposición y limitación</strong> — oponerte a ciertos tratamientos.</li>
          </ul>
          <p>Para ejercer cualquiera de estos derechos, escríbenos a <strong>ytbeviral@gmail.com</strong>. También puedes presentar una reclamación ante la Agencia Española de Protección de Datos (aepd.es).</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">9. Cookies</h2>
          <p>YTubViral utiliza únicamente cookies técnicas estrictamente necesarias para el funcionamiento del servicio (gestión de sesión). No utilizamos cookies de seguimiento ni publicitarias.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">10. Contacto</h2>
          <p>Para cualquier consulta sobre privacidad: <strong>ytbeviral@gmail.com</strong></p>
        </section>
      </div>
    </div>
  );
}
