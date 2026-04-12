export default function StripeSuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black flex items-center justify-center p-6">
      <div className="bg-gray-900 border border-purple-500/40 rounded-2xl p-10 max-w-md w-full text-center space-y-6">
        <div className="text-6xl">🎉</div>
        <h1 className="text-3xl font-bold text-white">¡Bienvenido a Pro!</h1>
        <p className="text-gray-400">
          Tu pago fue procesado correctamente. Ya tienes acceso a generaciones ilimitadas.
        </p>
        <a
          href="/dashboard"
          className="inline-block bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold py-3 px-8 rounded-lg transition"
        >
          Ir al dashboard →
        </a>
      </div>
    </div>
  );
}
