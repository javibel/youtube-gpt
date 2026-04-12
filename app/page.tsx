'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import TemplateSelector from '../components/TemplateSelector';
import InputForm from '../components/InputForm';
import OutputDisplay from '../components/OutputDisplay';
import { TEMPLATES } from '../utils/prompts';
import { callClaudeAPI } from '../utils/claudeAPI';

export default function Home() {
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKeyForm, setShowApiKeyForm] = useState<boolean>(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('title');
  const [formData, setFormData] = useState<Record<string, string>>({
    tema: '',
    tono: 'viral',
    duracion: '10',
  });
  const [output, setOutput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [usageCount, setUsageCount] = useState<number>(0);
  const MAX_FREE_GENERATIONS = 10;

  useEffect(() => {
    fetch('/api/user/stats')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.stats?.generationsThisMonth !== undefined) {
          setUsageCount(data.stats.generationsThisMonth);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const savedKey = localStorage.getItem('claude_api_key');
    if (savedKey) {
      setApiKey(savedKey);
      setShowApiKeyForm(false);
    }
  }, []);

  const handleApiKeySubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      setError('API key debe empezar con sk-ant-');
      return;
    }
    localStorage.setItem('claude_api_key', apiKey);
    setShowApiKeyForm(false);
    setError('');
  };

  const handleFormChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleGenerate = async () => {
    if (!apiKey) {
      setError('API key requerida');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await callClaudeAPI(apiKey, selectedTemplate, formData);
      setOutput(result);
      setUsageCount((prev) => prev + 1);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      if (errorMessage.includes('Límite del plan gratuito')) {
        setError(`Has alcanzado el límite de ${MAX_FREE_GENERATIONS} generaciones gratis este mes. Actualiza a PRO para generaciones ilimitadas.`);
      } else {
        setError(errorMessage);
      }
      setOutput('');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    alert('✅ Copiado al portapapeles');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black">
      {/* Header */}
      <div className="bg-black/50 border-b border-purple-500 p-6 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              🚀 YouTubeGPT
            </h1>
            <p className="text-gray-400 text-sm">Genera contenido viral en segundos</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-gray-400 text-sm">
                Generaciones: {usageCount}/{MAX_FREE_GENERATIONS}
              </div>
              <button
                onClick={() => {
                  setShowApiKeyForm(true);
                  setApiKey('');
                }}
                className="text-purple-400 hover:text-purple-300 text-sm mt-1"
              >
                Cambiar API key
              </button>
            </div>
            <a
              href="/dashboard"
              className="bg-gray-800 hover:bg-gray-700 border border-purple-500/50 text-white text-sm font-medium py-2 px-4 rounded-lg transition"
            >
              Mi perfil
            </a>
          </div>
        </div>
      </div>

      {/* API Key Modal */}
      {showApiKeyForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-purple-500 rounded-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold text-white mb-4">🔑 Ingresa tu API Key</h2>

            <form onSubmit={handleApiKeySubmit}>
              <div className="mb-4">
                <label className="block text-white mb-2">API Key de Claude</label>
                <input
                  type="password"
                  placeholder="sk-ant-..."
                  value={apiKey}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white placeholder-gray-500 focus:border-purple-500 outline-none"
                />
                <p className="text-xs text-gray-400 mt-2">
                  🔐 Tu API key solo se guarda en TU computadora, nunca en nuestros servidores
                </p>
              </div>

              {error && <div className="text-red-500 mb-4 text-sm">{error}</div>}

              <button
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded-lg"
              >
                Conectar
              </button>
            </form>

            <div className="mt-6 p-4 bg-gray-800 rounded text-sm text-gray-300">
              <p className="font-bold mb-2">¿No tienes API key?</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Ve a console.anthropic.com</li>
                <li>Crea una cuenta gratis</li>
                <li>Genera una API key</li>
                <li>Pégala aquí</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!showApiKeyForm && (
        <div className="p-6">
          <div className="max-w-7xl mx-auto">
            {/* Template Selector */}
            <TemplateSelector
              selected={selectedTemplate}
              onSelect={setSelectedTemplate}
              templates={TEMPLATES}
            />

            {/* Error Message */}
            {error && (
              <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6 text-red-400">
                ⚠️ {error}
              </div>
            )}

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left: Form */}
              <div className="bg-gray-900 rounded-lg p-8 border border-purple-500 h-fit sticky top-32">
                <h2 className="text-2xl font-bold text-white mb-6">📝 Completa los datos</h2>
                <InputForm
                  template={selectedTemplate}
                  formData={formData}
                  onFormChange={handleFormChange}
                  onGenerate={handleGenerate}
                  loading={loading}
                />
              </div>

              {/* Right: Output */}
              <OutputDisplay
                output={output}
                loading={loading}
                onRegenerate={handleGenerate}
                onCopy={handleCopy}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}