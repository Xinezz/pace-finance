import { ArrowLeft, ArrowRight, PartyPopper, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { categoriesForType, findSimilar, makeRule, needsCategory, ruleKeyFor } from '../../domain/categorize';
import { formatDate } from '../../domain/dates';
import type { Transaction } from '../../domain/types';
import { useFeedback } from '../../state/feedback';
import { useMoney, useStore } from '../../state/store';
import { CategoryChip } from '../category/CategoryChip';
import { CategoryPanel } from '../category/CategoryPicker';
import { CategoryEditorModal } from '../category/CategoryEditor';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/Feedback';
import { Modal } from '../ui/Modal';

interface Props {
  /** Specific transactions to walk through; omit to walk through everything that needs a category. */
  ids?: string[];
  onClose: () => void;
}

/**
 * A focused, one-at-a-time way to categorize. Number keys 1-9 pick a category, S skips, B goes back.
 * The choices offered first are the categories you use most for that kind of transaction.
 */
export function CategorizeFlow({ ids, onClose }: Props) {
  const { data, dispatch } = useStore();
  const { fmt } = useMoney();
  const { toast } = useFeedback();

  // Freeze the queue when the flow opens so the list doesn't shift under the user.
  const [queue] = useState<string[]>(() => (ids ? ids : data.transactions.filter(needsCategory).sort((a, b) => (a.date < b.date ? 1 : -1)).map((t) => t.id)));
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(0);
  const [remember, setRemember] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(data.transactions.map((t) => [t.id, t])), [data.transactions]);

  // Skip anything that was resolved meanwhile (for example by a remembered preference).
  const current: Transaction | undefined = (() => {
    for (let i = index; i < queue.length; i++) {
      const t = byId.get(queue[i]);
      if (t && (ids || needsCategory(t))) return t;
    }
    return undefined;
  })();
  const currentIdx = current ? queue.indexOf(current.id) : queue.length;

  // Most-used categories for this transaction type, from the user's own manual choices.
  const ranked = useMemo(() => {
    if (!current) return [];
    const counts = new Map<string, number>();
    for (const t of data.transactions) if (t.categorySource === 'manual' && t.type === current.type) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
    return categoriesForType(data.categories, current.type)
      .filter((c) => c.id !== 'other')
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  }, [current, data.transactions, data.categories]);

  const similar = useMemo(() => (current ? findSimilar(data.transactions, current.description, current.id).filter((t) => t.categorySource === 'none' || t.categorySource === 'auto') : []), [current, data.transactions]);
  const ruleKey = current ? ruleKeyFor(current.description) : null;

  useEffect(() => {
    setShowAll(false);
    // Only pre-tick "remember" when the description clearly repeats; a one-off shouldn't teach a rule.
    setRemember(similar.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const choose = (categoryId: string) => {
    if (!current) return;
    dispatch({ type: 'setCategory', ids: [current.id], categoryId });
    if (remember && ruleKey && categoryId !== 'other') dispatch({ type: 'addRule', rule: makeRule(ruleKey, categoryId), applyToExisting: true });
    setDone((d) => d + 1);
    setIndex(currentIdx + 1);
  };

  const skip = () => setIndex(currentIdx + 1);
  const back = () => {
    for (let i = currentIdx - 1; i >= 0; i--) {
      const t = byId.get(queue[i]);
      if (t) {
        setIndex(i);
        return;
      }
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[1-9]$/.test(e.key) && ranked[Number(e.key) - 1]) {
        e.preventDefault();
        choose(ranked[Number(e.key) - 1].id);
      } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowRight') skip();
      else if (e.key === 'b' || e.key === 'B' || e.key === 'ArrowLeft') back();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const total = queue.length;
  const position = Math.min(currentIdx + 1, total);

  const finish = () => {
    if (done > 0) toast(`Nice. ${done} transaction${done === 1 ? '' : 's'} categorized.`);
    onClose();
  };

  if (!current) {
    return (
      <Modal title={total === 0 ? 'Nothing to categorize' : 'All caught up'} onClose={finish} width="28rem">
        <div className="flex flex-col items-center py-6 text-center">
          <span className="mb-4 grid h-16 w-16 place-items-center rounded-full bg-sage-soft text-sage-deep">
            <PartyPopper size={28} aria-hidden />
          </span>
          <p className="max-w-xs text-sm leading-relaxed text-muted">
            {total === 0 ? 'Every transaction already has a category.' : done > 0 ? `You categorized ${done} transaction${done === 1 ? '' : 's'}. Your charts and budgets are up to date.` : 'You skipped everything for now. They’ll wait for you under Needs Your Attention.'}
          </p>
          <Button variant="primary" className="mt-6" onClick={finish} data-autofocus>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  const cat = data.categories.find((c) => c.id === current.categoryId);

  return (
    <Modal title="Categorize" description="Pick a category. You can always change it later." onClose={finish} width="38rem">
      <div ref={rootRef} className="flex flex-col gap-5">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
            <span>
              {position} of {total}
            </span>
            <span>{done} done</span>
          </div>
          <ProgressBar pct={(currentIdx / total) * 100} label="Categorization progress" height="sm" />
        </div>

        <div className="rounded-2xl bg-surface2 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words font-serif text-2xl leading-tight text-ink">{current.description}</p>
              <p className="mt-1 text-sm text-muted">
                {formatDate(current.date)}
                {current.paymentMethod ? ` · ${current.paymentMethod}` : ''}
              </p>
            </div>
            <p className={`shrink-0 text-xl font-semibold tabular-nums ${current.type === 'income' ? 'text-sage-deep' : 'text-ink'}`}>
              {current.type === 'income' ? '+' : current.refund ? '+' : '-'}
              {fmt(current.amount)}
            </p>
          </div>
          {current.notes && <p className="mt-2 text-sm italic text-muted">“{current.notes}”</p>}
          {current.categorySource === 'auto' && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              Currently suggested as <CategoryChip category={cat} size="sm" />
              <button type="button" className="font-semibold text-sage-deep hover:underline" onClick={() => choose(current.categoryId)}>
                Looks right
              </button>
            </p>
          )}
        </div>

        {!showAll ? (
          <div>
            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-3">
              {ranked.slice(0, 9).map((c, i) => (
                <button key={c.id} type="button" onClick={() => choose(c.id)} className="group relative flex items-center gap-2 rounded-2xl border border-line bg-surface px-2.5 py-3 text-left text-sm transition-all sm:gap-2.5 sm:px-3 hover:-translate-y-0.5 hover:border-sage-deep hover:shadow-[var(--shadow-card)]">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-base sm:h-9 sm:w-9 sm:text-lg" style={{ background: `color-mix(in srgb, ${c.color} 30%, transparent)` }} aria-hidden>
                    {c.icon}
                  </span>
                  <span className="min-w-0 flex-1 font-medium leading-tight text-ink hyphens-auto line-clamp-2">{c.name}</span>
                  <kbd className="absolute right-2 top-1.5 hidden rounded bg-surface2 px-1.5 text-[10px] font-semibold text-muted sm:block" aria-hidden>
                    {i + 1}
                  </kbd>
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" icon={<Search size={14} />} onClick={() => setShowAll(true)}>
                All categories & new…
              </Button>
              <Button size="sm" variant="ghost" onClick={() => choose('other')}>
                Mark as “Other”
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-line p-2">
            <CategoryPanel categories={categoriesForType(data.categories, current.type)} value={current.categorySource === 'manual' ? current.categoryId : undefined} onSelect={choose} onCreate={(n) => setCreating(n)} autoFocusSearch columns={2} />
          </div>
        )}

        {ruleKey && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2.5 text-sm">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--c-sage-deep)]" />
            <span>
              <span className="font-medium text-ink">Remember this for “{ruleKey}”</span>
              <span className="block text-xs text-muted">
                {similar.length > 0 ? `Also categorizes ${similar.length} other similar transaction${similar.length === 1 ? '' : 's'} now, and new ones automatically.` : 'New transactions with this description will go to the same category.'}
              </span>
            </span>
          </label>
        )}

        <div className="flex items-center justify-between border-t border-line pt-4">
          <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={back} disabled={currentIdx === 0}>
            Back
          </Button>
          <p className="hidden text-xs text-muted sm:block">
            Press <kbd className="rounded bg-surface2 px-1">1</kbd>–<kbd className="rounded bg-surface2 px-1">9</kbd> to choose · <kbd className="rounded bg-surface2 px-1">S</kbd> to skip
          </p>
          <Button variant="outline" size="sm" onClick={skip}>
            Skip <ArrowRight size={14} />
          </Button>
        </div>
      </div>
      {creating !== null && <CategoryEditorModal initialName={creating} defaultType={current.type === 'income' ? 'income' : 'expense'} onClose={() => setCreating(null)} onSaved={(cid) => choose(cid)} />}
      <span className="sr-only" aria-live="polite">
        {done > 0 ? `${done} categorized` : ''}
      </span>
    </Modal>
  );
}
