export default function LegalPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-300 px-4 py-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Aviso Legal</h1>
          <p className="text-gray-500 text-sm mt-2">Última actualización: abril de 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Titular del sitio web</h2>
          <p>El presente sitio web <strong>ytubviral.com</strong> y el servicio <strong>YTubViral</strong> son gestionados por un particular con domicilio en España.</p>
          <p>Email de contacto: <strong>ytbeviral@gmail.com</strong></p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Objeto</h2>
          <p>YTubViral es un servicio de generación de contenido asistido por inteligencia artificial dirigido a creadores de contenido en YouTube. El servicio se presta a través de Internet y está disponible globalmente.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Propiedad intelectual</h2>
          <p>El diseño, código fuente, logotipos y demás elementos del sitio web son propiedad de YTubViral o de sus respectivos titulares. Queda prohibida su reproducción total o parcial sin autorización expresa.</p>
          <p>El contenido generado por los usuarios a través del servicio es propiedad de dichos usuarios, sin que YTubViral reclame derechos sobre el mismo.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Exclusión de responsabilidad</h2>
          <p>YTubViral no garantiza la exactitud, completitud ni idoneidad del contenido generado por los modelos de inteligencia artificial. El usuario es el único responsable del uso que haga de dicho contenido.</p>
          <p>YTubViral no se responsabiliza de posibles daños derivados del uso del servicio, interrupciones técnicas, pérdida de datos o cualquier otro perjuicio directo o indirecto.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Legislación aplicable</h2>
          <p>El presente aviso legal se rige por la legislación española, en particular por:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Ley 34/2002, de Servicios de la Sociedad de la Información y Comercio Electrónico (LSSI-CE).</li>
            <li>Reglamento (UE) 2016/679 (RGPD) y Ley Orgánica 3/2018 (LOPDGDD).</li>
            <li>Real Decreto Legislativo 1/2007, de defensa de los consumidores y usuarios.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Resolución de litigios en línea</h2>
          <p>Conforme al Reglamento (UE) 524/2013, los usuarios residentes en la UE pueden acceder a la plataforma de resolución de litigios en línea de la Comisión Europea en: <a href="https://ec.europa.eu/consumers/odr" className="text-purple-400 hover:text-purple-300" target="_blank" rel="noopener noreferrer">ec.europa.eu/consumers/odr</a></p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Contacto</h2>
          <p>Para cualquier consulta legal: <strong>ytbeviral@gmail.com</strong></p>
        </section>
      </div>
    </div>
  );
}
