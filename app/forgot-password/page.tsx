'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-gray-900 rounded-2xl p-8 border border-gray-800">
        <h1 className="text-2xl font-bold text-white mb-2">¿Olvidaste tu contraseña?</h1>

        {sent ? (
          <div>
            <p className="text-gray-400 mt-4">
              Si ese email está registrado, recibirás un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada.
            </p>
            <Link href="/login" className="mt-6 block text-center text-purple-400 hover:text-purple-300 text-sm">
              Volver al login
            </Link>
          </div>
        ) : (
          <>
            <p className="text-gray-400 mb-6 text-sm">
              Introduce tu email y te enviaremos un enlace para restablecer tu contraseña.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                required
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
              >
                {loading ? 'Enviando...' : 'Enviar enlace'}
              </button>
            </form>
            <Link href="/login" className="mt-4 block text-center text-gray-500 hover:text-gray-400 text-sm">
              Volver al login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
