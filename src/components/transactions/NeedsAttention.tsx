import { CheckCheck, Sparkles, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { categoriesForType, needsCategory, needsReview } from '../../domain/categorize';
import { formatDate } from '../../domain/dates';
import type { Transaction, TxType } from '../../domain/types';
import { useCategorize } from '../../hooks/useCategorize';
import { useMoney, useStore } from '../../state/store';
import { useUi } from '../../state/ui';
import { CategoryAssignButton } from '../category/CategoryAssignButton';
import { CategoryChip } from '../category/CategoryChip';
import { CategoryChipButton } from '../category/CategoryPicker';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Badge } from '../ui/Feedback';
import { Segmented } from '../ui/Form';

/** Most-used categories (from the user's own manual choices), falling back to sensible defaults. */
function useQuickCategories(type: TxType) {
  const { data } = useStore();
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of data.transactions) if (t.categorySource === 'manual' && t.type === type) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
    const fallback = type === 'income' ? ['salary'] : ['food', 'groceries', 'shopping', 'transport'];
    return categoriesForType(data.categories, type)
      .filter((c) => c.id !== 'other')
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || fallback.indexOf(a.id) - fallback.indexOf(b.id))
      .slice(0, 4);
  }, [data.categories, data.transactions, type]);
}

function AttentionRow({ tx, selected, onToggle, mode }: { tx: Transaction; selected: boolean; onToggle: (id: string) => void; mode: 'uncategorized' | 'review' }) {
  const { fmt } = useMoney();
  const { data } = useStore();
  const { categorize, confirm } = useCategorize();
  const { openEditTx } = useUi();
  const quick = useQuickCategories(tx.type);
  const current = data.categories.find((c) => c.id === tx.categoryId);

  return (
    <li className={`flex flex-col gap-3 rounded-2xl border px-3 py-3 transition-colors lg:flex-row lg:items-center ${selected ? 'border-sage-deep bg-sage-soft/50' : 'border-line bg-surface'}`}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <input type="checkbox" checked={selected} onChange={() => onToggle(tx.id)} aria-label={`Select ${tx.description}`} className="h-4 w-4 shrink-0 accent-[var(--c-sage-deep)]" />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => openEditTx(tx.id)} className="block max-w-full truncate text-left font-medium text-ink hover:underline">
            {tx.description}
          </button>
          <p className="text-xs text-muted">
            {formatDate(tx.date, { day: 'numeric', month: 'short' })}
            {tx.paymentMethod ? ` · ${tx.paymentMethod}` : ''}
          </p>
        </div>
        <p className={`shrink-0 font-semibold tabular-nums ${tx.type === 'income' || tx.refund ? 'text-sage-deep' : 'text-ink'}`}>
          {tx.type === 'income' || tx.refund ? '+' : '-'}
          {fmt(tx.amount)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
        {mode === 'review' ? (
          <>
            <CategoryChip category={current} size="sm" />
            <Button size="sm" variant="soft" icon={<CheckCheck size={13} />} onClick={() => confirm([tx.id])}>
              Looks right
            </Button>
            <CategoryChipButton txType={tx.type} value={tx.categoryId} onSelect={(cid) => categorize([tx.id], cid)} size="sm" />
          </>
        ) : (
          <>
            {quick.map((c) => (
              <button key={c.id} type="button" onClick={() => categorize([tx.id], c.id)} className="inline-flex items-center gap-1 rounded-full border border-line2 bg-surface px-2.5 py-1 text-xs text-body transition-colors hover:border-sage-deep hover:bg-sage-soft" title={`Categorize as ${c.name}`}>
                <span aria-hidden>{c.icon}</span>
                {c.name.split(' ')[0].replace('&', '')}
              </button>
            ))}
            <CategoryChipButton txType={tx.type} value={tx.categoryId} onSelect={(cid) => categorize([tx.id], cid)} attention size="sm" />
          </>
        )}
      </div>
    </li>
  );
}

interface Props {
  /** Show at most this many rows before offering "show all". */
  limit?: number;
  /** Render nothing when there is nothing to do (dashboard) instead of a friendly all-clear. */
  hideWhenEmpty?: boolean;
}

export function NeedsAttention({ limit = 5, hideWhenEmpty }: Props) {
  const { data } = useStore();
  const { openCategorize } = useUi();
  const { categorize, confirm } = useCategorize();
  const [tab, setTab] = useState<'uncategorized' | 'review'>('uncategorized');
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const uncategorized = useMemo(() => data.transactions.filter(needsCategory).sort((a, b) => (a.date < b.date ? 1 : -1)), [data.transactions]);
  const review = useMemo(() => data.transactions.filter(needsReview).sort((a, b) => (a.date < b.date ? 1 : -1)), [data.transactions]);

  const activeTab = tab === 'review' && review.length === 0 ? 'uncategorized' : tab;
  const list = activeTab === 'uncategorized' ? uncategorized : review;
  const shown = expanded ? list : list.slice(0, limit);
  const chosen = list.filter((t) => selected.has(t.id));

  if (uncategorized.length === 0 && review.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <Card aria-labelledby="needs-title">
        <CardHeader id="needs-title" title="Needs Your Attention" icon={<Sparkles size={17} />} />
        <p className="flex items-center gap-2 text-sm text-muted">
          <span aria-hidden>🌿</span> Everything has a category you’re happy with. Lovely.
        </p>
      </Card>
    );
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Card aria-labelledby="needs-title" className="border-peach/50 bg-gradient-to-br from-peach-soft/50 to-surface">
      <CardHeader
        id="needs-title"
        title={
          <span className="flex items-center gap-2">
            Needs Your Attention
            <Badge tone="peach">{uncategorized.length + review.length}</Badge>
          </span>
        }
        subtitle="These are waiting for you. Choosing a category here takes one tap and updates every chart straight away."
        icon={<Sparkles size={17} />}
        action={
          uncategorized.length > 0 && (
            <Button size="sm" variant="primary" icon={<Wand2 size={14} />} onClick={() => openCategorize()}>
              Categorize one by one
            </Button>
          )
        }
      />

      {review.length > 0 && uncategorized.length > 0 && (
        <Segmented
          ariaLabel="Which to show"
          size="sm"
          className="mb-3"
          value={activeTab}
          onChange={(v) => {
            setTab(v);
            setSelected(new Set());
            setExpanded(false);
          }}
          options={[
            { value: 'uncategorized', label: `Uncategorized (${uncategorized.length})` },
            { value: 'review', label: `Suggested (${review.length})` },
          ]}
        />
      )}
      {activeTab === 'review' && <p className="mb-3 text-xs text-muted">We guessed these from the description. Confirm them to lock them in, or change any that are wrong.</p>}

      {chosen.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-sage-soft px-3 py-2 text-sm [animation:fade-in_0.15s_ease_both]">
          <span className="font-medium text-ink">{chosen.length} selected</span>
          <CategoryAssignButton types={[...new Set(chosen.map((t) => t.type))]} onAssign={(cid) => { categorize(chosen.map((t) => t.id), cid); setSelected(new Set()); }}>
            Set category for all
          </CategoryAssignButton>
          {activeTab === 'review' && (
            <Button size="sm" variant="outline" onClick={() => { confirm(chosen.map((t) => t.id)); setSelected(new Set()); }}>
              Confirm all
            </Button>
          )}
          <button type="button" className="ml-auto text-xs font-medium text-sage-deep hover:underline" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {shown.map((t) => (
          <AttentionRow key={t.id} tx={t} selected={selected.has(t.id)} onToggle={toggle} mode={activeTab} />
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {list.length > limit ? (
          <button type="button" className="text-sm font-medium text-sage-deep hover:underline" onClick={() => setExpanded((e) => !e)}>
            {expanded ? 'Show fewer' : `Show all ${list.length}`}
          </button>
        ) : (
          <span />
        )}
        {list.length > 1 && (
          <button type="button" className="text-sm text-muted hover:text-ink hover:underline" onClick={() => setSelected(selected.size === list.length ? new Set() : new Set(list.map((t) => t.id)))}>
            {selected.size === list.length ? 'Deselect all' : 'Select all'}
          </button>
        )}
      </div>
    </Card>
  );
}
