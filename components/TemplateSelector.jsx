export default function TemplateSelector({ selected, onSelect, templates }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
      {Object.entries(templates).map(([key, template]) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`p-4 rounded-lg text-left transition ${
            selected === key
              ? 'bg-purple-600 border-2 border-purple-400'
              : 'bg-gray-800 border-2 border-gray-700 hover:border-purple-400'
          }`}
        >
          <div className="font-bold text-white">{template.name}</div>
          <div className="text-sm text-gray-300">{template.description}</div>
        </button>
      ))}
    </div>
  );
}