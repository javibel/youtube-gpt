import { TEMPLATES } from '../utils/prompts';

const FIELD_LABELS = {
  tema: 'Tema del video',
  tono: 'Tono / Estilo',
  duracion: 'Duración (minutos)',
  keywords: 'Keywords',
  plataforma: 'Plataforma',
  estilo: 'Estilo visual',
  cta: 'Call to Action',
  nicho: 'Tu nicho o categoría',
  num_videos: 'Número de episodios',
};

const FIELD_PLACEHOLDERS = {
  tema: 'Ej: Cómo aprender a programar en 30 días',
  keywords: 'Ej: programación, tutorial, principiantes',
  cta: 'Ej: Suscribirse, ver la parte 2...',
  nicho: 'Ej: Finanzas personales, Gaming, Cocina saludable...',
};

export default function InputForm({ template, formData, onFormChange, onGenerate, loading }) {
  const templateData = TEMPLATES[template];
  const inputs = templateData?.inputs || [];

  return (
    <div className="space-y-5">
      {inputs.map((input) => (
        <div key={input} className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500">
            {FIELD_LABELS[input] ?? input}
          </label>

          {input === 'tono' && (
            <select
              value={formData.tono || 'viral'}
              onChange={(e) => onFormChange('tono', e.target.value)}
              className="neon-select w-full rounded-xl px-4 py-2.5 text-sm"
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
              className="neon-select w-full rounded-xl px-4 py-2.5 text-sm"
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
              className="neon-select w-full rounded-xl px-4 py-2.5 text-sm"
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
              className="neon-input w-full rounded-xl px-4 py-2.5 text-sm"
              placeholder="10"
            />
          )}

          {input === 'num_videos' && (
            <input
              type="number"
              min="3"
              max="20"
              value={formData.num_videos || '5'}
              onChange={(e) => onFormChange('num_videos', e.target.value)}
              className="neon-input w-full rounded-xl px-4 py-2.5 text-sm"
              placeholder="5"
            />
          )}

          {(input === 'tema' || input === 'keywords' || input === 'cta' || input === 'nicho') && (
            <textarea
              value={formData[input] || ''}
              onChange={(e) => onFormChange(input, e.target.value)}
              className="neon-input w-full rounded-xl px-4 py-2.5 text-sm resize-none"
              rows={input === 'tema' || input === 'nicho' ? 3 : 2}
              placeholder={FIELD_PLACEHOLDERS[input] ?? ''}
            />
          )}
        </div>
      ))}

      <button
        onClick={onGenerate}
        disabled={loading || !formData.tema}
        className="btn-neon w-full flex items-center justify-center gap-2 font-semibold py-3 rounded-xl text-sm mt-2"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin" />
            Generando...
          </>
        ) : (
          '✦ Generar Contenido'
        )}
      </button>
    </div>
  );
}
