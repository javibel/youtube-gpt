import { TEMPLATES } from '../utils/prompts';

export default function InputForm({
  template,
  formData,
  onFormChange,
  onGenerate,
  loading,
}) {
  const templateData = TEMPLATES[template];
  const inputs = templateData.inputs || [];

  return (
    <div className="space-y-4">
      {inputs.map((input) => (
        <div key={input}>
          <label className="block text-white mb-2 font-semibold">
            {input === 'tema' && '📌 Tema del video'}
            {input === 'tono' && '🎭 Tono/Estilo'}
            {input === 'duracion' && '⏱️ Duración (minutos)'}
            {input === 'keywords' && '🔍 Keywords (opcional)'}
            {input === 'plataforma' && '📱 Plataforma'}
            {input === 'estilo' && '✨ Estilo'}
            {input === 'cta' && '🔔 Call to Action'}
          </label>

          {input === 'tono' && (
            <select
              value={formData.tono || 'viral'}
              onChange={(e) => onFormChange('tono', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white"
            >
              <option value="viral">Viral / Clickbait</option>
              <option value="profesional">Profesional</option>
              <option value="casual">Casual / Amistoso</option>
              <option value="educativo">Educativo</option>
              <option value="entretenido">Entretenido</option>
            </select>
          )}

          {input === 'plataforma' && (
            <select
              value={formData.plataforma || 'youtube'}
              onChange={(e) => onFormChange('plataforma', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white"
            >
              <option value="youtube">YouTube</option>
              <option value="youtube-shorts">YouTube Shorts</option>
              <option value="tiktok">TikTok</option>
              <option value="instagram">Instagram Reels</option>
            </select>
          )}

          {input === 'estilo' && (
            <select
              value={formData.estilo || 'viral'}
              onChange={(e) => onFormChange('estilo', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white"
            >
              <option value="viral">Viral</option>
              <option value="cómico">Cómico</option>
              <option value="dramático">Dramático</option>
              <option value="sorpresa">Sorpresa</option>
              <option value="mysterious">Misterioso</option>
            </select>
          )}

          {input === 'duracion' && (
            <input
              type="number"
              min="1"
              max="240"
              value={formData.duracion || '10'}
              onChange={(e) => onFormChange('duracion', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white"
              placeholder="10"
            />
          )}

          {(input === 'tema' || input === 'keywords' || input === 'cta') && (
            <textarea
              value={formData[input] || ''}
              onChange={(e) => onFormChange(input, e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white placeholder-gray-500 resize-none"
              rows={input === 'tema' ? 3 : 2}
              placeholder={
                input === 'tema'
                  ? 'Ej: Cómo aprender a programar en 30 días'
                  : input === 'keywords'
                  ? 'Ej: programación, tutorial, principiantes'
                  : 'Ej: Suscribirse, ver la parte 2, etc'
              }
            />
          )}
        </div>
      ))}

      <button
        onClick={onGenerate}
        disabled={loading || !formData.tema}
        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-600 text-white font-bold py-3 rounded-lg transition text-lg"
      >
        {loading ? '⏳ Generando...' : '✨ Generar Contenido'}
      </button>
    </div>
  );
}