import type { Category } from '../../domain/types';

interface CategoryChipProps {
  category: Pick<Category, 'name' | 'icon' | 'color'> | undefined;
  size?: 'sm' | 'md';
  /** Show the icon only (with the name as accessible text). */
  compact?: boolean;
  className?: string;
}

/** A soft pill in the category's own colour. Text stays in the normal ink colour for contrast. */
export function CategoryChip({ category, size = 'md', compact, className = '' }: CategoryChipProps) {
  const c = category ?? { name: 'Uncategorized', icon: '📦', color: '#B8AFA0' };
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full text-ink ${size === 'sm' ? 'py-0.5 pl-1.5 pr-2 text-xs' : 'py-1 pl-2 pr-3 text-[13px]'} ${className}`}
      style={{ background: `color-mix(in srgb, ${c.color} 26%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c.color} 45%, transparent)` }}
    >
      <span aria-hidden className={size === 'sm' ? 'text-[13px]' : 'text-sm'}>
        {c.icon}
      </span>
      <span className={compact ? 'sr-only' : 'truncate'}>{c.name}</span>
    </span>
  );
}

export function CategoryDot({ color, size = 10 }: { color: string; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />;
}

/** Round emoji badge used in lists. */
export function CategoryIcon({ category, size = 40 }: { category: Pick<Category, 'icon' | 'color'> | undefined; size?: number }) {
  const c = category ?? { icon: '📦', color: '#B8AFA0' };
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-2xl"
      style={{ width: size, height: size, fontSize: size * 0.48, background: `color-mix(in srgb, ${c.color} 30%, transparent)` }}
    >
      {c.icon}
    </span>
  );
}
