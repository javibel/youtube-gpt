const ICONS = {
  title: '🎯',
  description: '📝',
  caption: '💬',
  thumbnail: '🖼️',
  script: '🎬',
  shorts_hook: '⚡',
  series: '📚',
  niche_analysis: '🔍',
};

export default function TemplateSelector({ selected, onSelect, templates, isPro, onProRequired }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {Object.entries(templates).map(([key, template]) => {
        const isSelected = selected === key;
        const isLocked = template.proOnly && !isPro;

        return (
          <button
            key={key}
            onClick={() => {
              if (isLocked) { onProRequired?.(); return; }
              onSelect(key);
            }}
            className={`p-4 rounded-xl text-left transition-all relative ${
              isSelected ? 'neon-card-active' : 'neon-card'
            } ${isLocked ? 'opacity-60' : ''}`}
          >
            {/* Badge PRO */}
            {template.proOnly && (
              <span
                className="absolute top-2 right-2 text-xs font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  background: isPro
                    ? 'linear-gradient(90deg,#00D9FF,#CC00FF)'
                    : 'rgba(255,255,255,0.08)',
                  color: isPro ? '#000' : '#888',
                  fontSize: '9px',
                  letterSpacing: '0.05em',
                }}
              >
                {isPro ? 'PRO' : '🔒 PRO'}
              </span>
            )}

            <div className="text-xl mb-2">{ICONS[key] ?? '📄'}</div>
            <div className={`font-semibold text-sm ${isSelected ? 'text-cyan-glow' : isLocked ? 'text-gray-500' : 'text-gray-300'}`}>
              {template.name.replace(/^[^\s]+\s/, '')}
            </div>
            <div className="text-gray-600 text-xs mt-0.5 line-clamp-1">{template.description}</div>
          </button>
        );
      })}
    </div>
  );
}
