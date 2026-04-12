export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-300 px-4 py-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Términos y Condiciones</h1>
          <p className="text-gray-500 text-sm mt-2">Última actualización: abril de 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">1. Identificación del servicio</h2>
          <p>YTubViral es un servicio web accesible en <strong>ytubviral.com</strong> que ofrece herramientas de generación de contenido asistidas por inteligencia artificial para creadores de contenido en YouTube. El servicio es gestionado por un particular con domicilio en España, contactable a través de <strong>ytbeviral@gmail.com</strong>.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">2. Aceptación de los términos</h2>
          <p>El acceso y uso de YTubViral implica la aceptación plena y sin reservas de los presentes Términos y Condiciones. Si no está de acuerdo con alguno de los términos aquí establecidos, debe abstenerse de utilizar el servicio.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">3. Descripción del servicio</h2>
          <p>YTubViral proporciona acceso a herramientas de generación de contenido (títulos, descripciones, scripts, captions y conceptos para miniaturas) para vídeos de YouTube mediante modelos de inteligencia artificial de terceros.</p>
          <p>El servicio requiere que el usuario aporte su propia clave de API de un proveedor de IA (actualmente Anthropic). YTubViral no almacena dicha clave y no asume responsabilidad sobre su uso ni sobre los costes derivados de su utilización.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">4. Planes y precios</h2>
          <p><strong>Plan gratuito:</strong> hasta 10 generaciones por mes natural, sin coste.</p>
          <p><strong>Plan Pro:</strong> hasta 200 generaciones por mes natural, por un precio de <strong>9,99 € al mes</strong> (IVA no incluido si aplicara). El plan se renueva automáticamente cada mes hasta que el usuario lo cancele.</p>
          <p>Los precios pueden modificarse con un preaviso mínimo de 30 días comunicado por email.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">5. Pagos y cancelaciones</h2>
          <p>Los pagos se procesan a través de <strong>Stripe</strong>, proveedor externo de servicios de pago. YTubViral no almacena datos de tarjetas bancarias.</p>
          <p>El usuario puede cancelar su suscripción Pro en cualquier momento desde su panel de usuario. La cancelación tendrá efecto al finalizar el periodo de facturación en curso, manteniendo el acceso Pro hasta esa fecha. No se realizarán reembolsos por el periodo no consumido.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">6. Uso aceptable</h2>
          <p>El usuario se compromete a utilizar YTubViral de forma lícita y conforme a estos términos. Queda prohibido:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Usar el servicio para generar contenido ilegal, difamatorio, fraudulento o que infrinja derechos de terceros.</li>
            <li>Intentar eludir los límites técnicos del servicio.</li>
            <li>Revender o redistribuir el servicio sin autorización expresa.</li>
            <li>Usar el servicio de forma automatizada masiva que perjudique su funcionamiento.</li>
          </ul>
          <p>YTubViral se reserva el derecho a suspender o cancelar cuentas que incumplan estas condiciones sin previo aviso y sin derecho a reembolso.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">7. Propiedad intelectual del contenido generado</h2>
          <p>El contenido generado a través de YTubViral es propiedad del usuario que lo genera. YTubViral no reclama derechos sobre dicho contenido. No obstante, el usuario es el único responsable del uso que haga del contenido generado y de cualquier reclamación de terceros derivada de dicho uso.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">8. Limitación de responsabilidad</h2>
          <p>YTubViral se ofrece "tal cual" y no garantiza que el servicio sea ininterrumpido, libre de errores o que los resultados generados sean precisos, originales o adecuados para un fin concreto.</p>
          <p>YTubViral no será responsable de pérdidas de ingresos, daños indirectos, pérdida de datos u otros perjuicios derivados del uso o la imposibilidad de uso del servicio, incluso si se hubiera advertido de la posibilidad de dichos daños.</p>
          <p>La responsabilidad máxima de YTubViral frente al usuario no excederá en ningún caso el importe abonado por el usuario en los tres meses anteriores al hecho que origina la reclamación.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">9. Modificaciones del servicio</h2>
          <p>YTubViral se reserva el derecho a modificar, suspender o interrumpir el servicio en cualquier momento, con o sin previo aviso. En caso de cambios sustanciales en los precios o condiciones, se notificará al usuario con al menos 30 días de antelación.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">10. Ley aplicable y jurisdicción</h2>
          <p>Los presentes términos se rigen por la legislación española. Para cualquier controversia derivada del uso del servicio, ambas partes se someten a los juzgados y tribunales competentes conforme a la normativa española vigente.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">11. Contacto</h2>
          <p>Para cualquier consulta sobre estos términos, puede contactar con nosotros en: <strong>ytbeviral@gmail.com</strong></p>
        </section>
      </div>
    </div>
  );
}
