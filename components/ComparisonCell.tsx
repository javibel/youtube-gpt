import { CheckIcon, CrossIcon } from '@/components/icons';

/**
 * Renders a comparison-table cell whose value may be a plain checkmark/cross
 * ("✓", "✗") or a checkmark followed by qualifying text ("✓ (Pro)"). Used across
 * app/features/* comparison tables — swaps the literal ✓/✗ characters for inline
 * SVG so they render crisp and monochrome instead of relying on the OS emoji font.
 */
export default function ComparisonCell({ value }: { value: string }) {
  if (value === '✓') return <CheckIcon size={16} className="inline-block" style={{ color: '#7CFF00' }} />;
  if (value === '✗') return <CrossIcon size={16} className="inline-block" style={{ color: '#52525b' }} />;
  if (value.startsWith('✓ ')) {
    return (
      <span className="inline-flex items-center gap-1">
        <CheckIcon size={16} style={{ color: '#7CFF00' }} />
        {value.slice(2)}
      </span>
    );
  }
  return <>{value}</>;
}
