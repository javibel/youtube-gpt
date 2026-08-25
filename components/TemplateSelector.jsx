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
            className={`yv-glass ${isSelected ? 'yv-glass--brand' : 'yv-glass--hover'} p-4 text-left transition-all relative ${isLocked ? 'opacity-60' : ''}`}
          >
            {/* Badge PRO */}
            {template.proOnly && (
              <span
                className="yv-badge absolute top-2 right-2"
                style={{
                  background: isPro ? 'var(--yv-brand-fill)' : 'var(--yv-glass-chip)',
                  color: isPro ? '#fff' : 'var(--yv-text-4)',
                }}
              >
                {isPro ? 'PRO' : '🔒 PRO'}
              </span>
            )}

            <div className="text-xl mb-2">{ICONS[key] ?? '📄'}</div>
            <div className="font-display font-semibold text-sm" style={{ color: isSelected ? 'var(--yv-brand-lift)' : isLocked ? 'var(--yv-text-4)' : 'var(--yv-text-2)' }}>
              {template.name.replace(/^[^\s]+\s/, '')}
            </div>
            <div className="text-gray-600 text-[13px] mt-0.5 line-clamp-1">{template.description}</div>
          </button>
        );
      })}
    </div>
  );
}
