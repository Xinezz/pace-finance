import { ArrowRight, Hash, Pencil } from 'lucide-react';
import { memo } from 'react';
import { formatDate } from '../../domain/dates';
import type { Account, Category, Transaction } from '../../domain/types';
import { useCategorize } from '../../hooks/useCategorize';
import { useMoney } from '../../state/store';
import { useUi } from '../../state/ui';
import { CategoryIcon } from '../category/CategoryChip';
import { CategoryChipButton } from '../category/CategoryPicker';
import { Badge } from '../ui/Feedback';

export function amountText(t: Transaction, fmt: (n: number) => string): { text: string; tone: string } {
  if (t.type === 'income') return { text: `+${fmt(t.amount)}`, tone: 'text-sage-deep' };
  if (t.type === 'expense' && t.refund) return { text: `+${fmt(t.amount)}`, tone: 'text-sage-deep' };
  if (t.type === 'expense') return { text: `-${fmt(t.amount)}`, tone: 'text-ink' };
  return { text: fmt(t.amount), tone: 'text-butter-deep' };
}

interface RowProps {
  tx: Transaction;
  category: Category | undefined;
  accounts: Account[];
  selected?: boolean;
  onToggle?: (id: string) => void;
  /** Hide the inline category control (e.g. inside lists that already group by category). */
  hideCategory?: boolean;
  showDate?: boolean;
  /** For narrow panels: the category chip sits under the description and the edit button is hidden. */
  compact?: boolean;
}

export const TransactionRow = memo(function TransactionRow({ tx, category, accounts, selected, onToggle, hideCategory, showDate = true, compact }: RowProps) {
  const { fmt } = useMoney();
  const { openEditTx } = useUi();
  const { categorize } = useCategorize();
  const { text, tone } = amountText(tx, fmt);
  const accName = (id?: string) => accounts.find((a) => a.id === id)?.name ?? '';
  const isTransfer = tx.type === 'transfer';
  const needs = !isTransfer && tx.categorySource === 'none';

  return (
    <div className={`group relative flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-surface2/70 ${selected ? 'bg-sage-soft/60' : ''}`}>
      {onToggle && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={() => onToggle(tx.id)}
          aria-label={`Select ${tx.description}`}
          className="relative z-[1] h-4 w-4 shrink-0 accent-[var(--c-sage-deep)]"
        />
      )}
      <CategoryIcon category={isTransfer ? category : category} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <button type="button" onClick={() => openEditTx(tx.id)} className="max-w-full truncate text-left text-[15px] font-medium text-ink after:absolute after:inset-0 after:rounded-2xl hover:underline">
            {tx.description}
          </button>
          {tx.isDemo && <Badge tone="butter" title="Part of the demo data">Demo</Badge>}
          {tx.refund && <Badge tone="sage">Refund</Badge>}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {showDate && <span>{formatDate(tx.date, { day: 'numeric', month: 'short' })}</span>}
          {isTransfer ? (
            <span className="inline-flex items-center gap-1">
              {accName(tx.accountId)} <ArrowRight size={11} aria-hidden /> {accName(tx.toAccountId)}
            </span>
          ) : (
            tx.paymentMethod && <span>{tx.paymentMethod}</span>
          )}
          {tx.tags.slice(0, 3).map((t) => (
            <span key={t} className="inline-flex items-center text-sage-deep">
              <Hash size={10} aria-hidden />
              {t}
            </span>
          ))}
        </p>
        {!hideCategory && !isTransfer && (
          <div className={compact ? 'relative z-[1] mt-1.5 w-fit max-w-full' : 'relative z-[1] mt-1.5 w-fit max-w-full sm:hidden'}>
            <CategoryChipButton txType={tx.type} value={tx.categoryId} onSelect={(cid) => categorize([tx.id], cid)} attention={needs} suggested={tx.categorySource === 'auto'} />
          </div>
        )}
      </div>
      {!hideCategory && !isTransfer && !compact && (
        <div className="relative z-[1] hidden w-48 shrink-0 sm:block">
          <CategoryChipButton txType={tx.type} value={tx.categoryId} onSelect={(cid) => categorize([tx.id], cid)} attention={needs} suggested={tx.categorySource === 'auto'} />
        </div>
      )}
      <p className={`shrink-0 text-right text-[15px] font-semibold tabular-nums ${tone}`}>{text}</p>
      {!compact && (
        <button
          type="button"
          onClick={() => openEditTx(tx.id)}
          aria-label={`Edit ${tx.description}`}
          className="relative z-[1] hidden h-8 w-8 shrink-0 place-items-center rounded-lg text-muted opacity-0 transition-opacity hover:bg-surface hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 sm:grid"
        >
          <Pencil size={15} />
        </button>
      )}
    </div>
  );
});
