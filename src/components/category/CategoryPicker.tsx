import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { categoriesForType } from '../../domain/categorize';
import type { Category, TxType } from '../../domain/types';
import { useStore } from '../../state/store';
import { Popover } from '../ui/Popover';
import { CategoryChip } from './CategoryChip';
import { CategoryEditorModal } from './CategoryEditor';

interface PanelProps {
  categories: Category[];
  value?: string;
  onSelect: (id: string) => void;
  onCreate?: (initialName: string) => void;
  autoFocusSearch?: boolean;
  columns?: 1 | 2;
}

/** The searchable list of categories. Arrow keys move between options; Enter on the search box picks the first match. */
export function CategoryPanel({ categories, value, onSelect, onCreate, autoFocusSearch, columns = 1 }: PanelProps) {
  const [q, setQ] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? categories.filter((c) => c.name.toLowerCase().includes(n)) : categories;
  }, [categories, q]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-cat-option]') ?? []);
    if (!items.length) return;
    e.preventDefault();
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[idx === -1 ? 0 : next].focus();
  };

  return (
    <div onKeyDown={onKey}>
      <div className="relative mb-2">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          // On touch screens the keyboard would cover the list, so only jump into search with a mouse/trackpad.
          autoFocus={autoFocusSearch && window.matchMedia('(pointer: fine)').matches}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered[0]) {
              e.preventDefault();
              onSelect(filtered[0].id);
            }
          }}
          placeholder="Search categories"
          aria-label="Search categories"
          className="h-9 w-full rounded-xl border border-line2 bg-surface pl-9 pr-3 text-body placeholder:text-muted/70 focus:border-sage-deep focus:outline-none focus:ring-2 focus:ring-sage/40"
        />
      </div>
      <div ref={listRef} role="listbox" aria-label="Categories" className={`grid grid-cols-1 gap-0.5 ${columns === 2 ? 'sm:grid-cols-2' : ''}`}>
        {filtered.map((c) => (
          <button
            key={c.id}
            type="button"
            role="option"
            aria-selected={c.id === value}
            data-cat-option
            onClick={() => onSelect(c.id)}
            className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface2 ${c.id === value ? 'bg-sage-soft' : ''}`}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-base" style={{ background: `color-mix(in srgb, ${c.color} 30%, transparent)` }} aria-hidden>
              {c.icon}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink">{c.name}</span>
            {c.id === value && <Check size={15} className="text-sage-deep" aria-hidden />}
          </button>
        ))}
        {filtered.length === 0 && <p className="px-3 py-4 text-center text-sm text-muted">No category called “{q}”.</p>}
      </div>
      {onCreate && (
        <button
          type="button"
          onClick={() => onCreate(q.trim())}
          className="mt-1 flex w-full items-center gap-2.5 rounded-xl border border-dashed border-line2 px-2.5 py-2 text-left text-sm font-medium text-sage-deep transition-colors hover:bg-sage-soft"
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-sage-soft" aria-hidden>
            <Plus size={15} />
          </span>
          {q.trim() ? `Create “${q.trim()}”` : 'Create a new category'}
        </button>
      )}
    </div>
  );
}

interface FieldProps {
  txType: TxType;
  value: string;
  onChange: (categoryId: string) => void;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true';
}

/** Category control for forms: a button that opens an inline list (no overlay, so it works inside dialogs). */
export function CategoryField({ txType, value, onChange, id, ...aria }: FieldProps) {
  const { data } = useStore();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const panelId = useId();
  const categories = useMemo(() => categoriesForType(data.categories, txType), [data.categories, txType]);
  const selected = data.categories.find((c) => c.id === value);

  return (
    <div>
      <button
        id={id}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-line2 bg-surface px-2.5 text-left transition-colors hover:bg-surface2 focus:border-sage-deep focus:outline-none focus:ring-2 focus:ring-sage/40"
        {...aria}
      >
        <CategoryChip category={selected} />
        <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className="mt-2 rounded-2xl border border-line bg-surface2/60 p-2 [animation:fade-in_0.15s_ease_both]">
          <CategoryPanel
            categories={categories}
            value={value}
            columns={2}
            onSelect={(cid) => {
              onChange(cid);
              setOpen(false);
            }}
            onCreate={(name) => setCreating(name)}
          />
        </div>
      )}
      {creating !== null && (
        <CategoryEditorModal
          initialName={creating}
          defaultType={txType === 'income' ? 'income' : 'expense'}
          onClose={() => setCreating(null)}
          onSaved={(cid) => {
            onChange(cid);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

interface ChipButtonProps {
  txType: TxType;
  value: string;
  onSelect: (categoryId: string) => void;
  /** Visual hint: this transaction still needs a category. */
  attention?: boolean;
  /** "auto" shows a small marker that the category was suggested, not chosen. */
  suggested?: boolean;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

/** A category pill that opens a picker in a popover, for changing a category in place (tables, lists). */
export function CategoryChipButton({ txType, value, onSelect, attention, suggested, size = 'sm', disabled }: ChipButtonProps) {
  const { data } = useStore();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const categories = useMemo(() => categoriesForType(data.categories, txType), [data.categories, txType]);
  const selected = data.categories.find((c) => c.id === value);

  if (disabled) return <CategoryChip category={selected} size={size} />;

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Category: ${selected?.name ?? 'Uncategorized'}. Change category`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`tap group inline-flex max-w-full items-center gap-1 rounded-full transition-all hover:brightness-95 focus-visible:ring-2 focus-visible:ring-sage-deep ${attention ? 'ring-1 ring-dashed ring-peach-deep/70' : ''}`}
      >
        <CategoryChip category={selected} size={size} />
        {suggested && (
          <span className="rounded-full bg-butter-soft px-1.5 py-px text-[10px] font-semibold text-butter-deep" title="Suggested automatically. Open to confirm or change.">
            auto
          </span>
        )}
        <ChevronDown size={12} className="-ml-0.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100" aria-hidden />
      </button>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} label="Choose a category" width={300}>
        <CategoryPanel
          categories={categories}
          value={value}
          autoFocusSearch
          onSelect={(cid) => {
            onSelect(cid);
            setOpen(false);
          }}
          onCreate={(name) => {
            setOpen(false);
            setCreating(name);
          }}
        />
      </Popover>
      {creating !== null && (
        <CategoryEditorModal initialName={creating} defaultType={txType === 'income' ? 'income' : 'expense'} onClose={() => setCreating(null)} onSaved={onSelect} />
      )}
    </>
  );
}
