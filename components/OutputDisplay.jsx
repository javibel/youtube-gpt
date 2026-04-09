export default function OutputDisplay({ output, loading, onRegenerate, onCopy }) {
  if (!output && !loading) {
    return (
      <div className="bg-gray-900 rounded-lg p-8 border border-purple-500 h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🚀</div>
          <div className="text-gray-400 text-lg">
            Completa el formulario y presiona "Generar Contenido"
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg p-8 border border-purple-500">
      <h3 className="text-white font-bold mb-4 text-lg">📋 Resultado</h3>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4"></div>
            <div className="text-gray-400">Generando contenido increíble...</div>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-gray-800 rounded p-4 text-white mb-4 max-h-96 overflow-y-auto whitespace-pre-wrap font-mono text-sm border border-gray-700">
            {output}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCopy}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg transition"
            >
              ✅ Copiar al portapapeles
            </button>
            <button
              onClick={onRegenerate}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition"
            >
              🔄 Regenerar
            </button>
          </div>
        </>
      )}
    </div>
  );
}