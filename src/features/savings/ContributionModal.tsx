import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, MoneyInput, Select, TextInput } from '../../components/ui/Form';
import { Modal } from '../../components/ui/Modal';
import { goalSaved } from '../../domain/calc';
import { isValidDateStr } from '../../domain/dates';
import { uid } from '../../domain/ids';
import { parseAmount } from '../../domain/money';
import { SPECIAL, type Goal } from '../../domain/types';
import { useFeedback } from '../../state/feedback';
import { useMoney, useStore } from '../../state/store';

interface Props {
  goal: Goal;
  mode: 'add' | 'withdraw';
  onClose: () => void;
}

type Method = 'move' | 'assign';

/**
 * Adding to (or taking from) a goal either MOVES money between accounts (a transfer - never income or
 * an expense) or just ASSIGNS money that already sits in savings. Either way, nothing is counted twice.
 */
export function ContributionModal({ goal, mode, onClose }: Props) {
  const { data, dispatch, today } = useStore();
  const { currency, fmt } = useMoney();
  const { toast } = useFeedback();
  const adding = mode === 'add';

  const spending = data.accounts.filter((a) => a.kind === 'spending');
  const savings = data.accounts.filter((a) => a.kind === 'savings');
  const canMove = spending.length > 0 && savings.length > 0;
  const saved = goalSaved(goal, data.goalEntries, data.transactions, data.accounts);

  const [method, setMethod] = useState<Method>(canMove ? 'move' : 'assign');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [fromId, setFromId] = useState(spending[0]?.id ?? '');
  const [toId, setToId] = useState(savings[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = parseAmount(amount, currency);
    if (v === null || v <= 0) return setError('Enter an amount larger than zero.');
    if (!isValidDateStr(date)) return setError('Pick a valid date.');
    if (!adding && v > Math.max(0, saved)) return setError(`You can take out at most ${fmt(Math.max(0, saved))}, the amount saved in this goal.`);
    setError(null);

    const nowTs = Date.now();
    if (method === 'move') {
      const from = adding ? fromId : toId; // money leaves savings when withdrawing
      const to = adding ? toId : fromId;
      if (!from || !to || from === to) return setError('Choose two different accounts.');
      dispatch({
        type: 'addTx',
        tx: {
          id: uid('tx'), type: 'transfer', description: adding ? `Transfer to ${goal.name}` : `Withdrawal from ${goal.name}`, amount: v, date,
          categoryId: SPECIAL.savings, categorySource: 'rule', tags: ['savings'], notes: note.trim() || undefined,
          accountId: from, toAccountId: to, goalId: goal.id, createdAt: nowTs, updatedAt: nowTs,
        },
      });
    } else {
      dispatch({ type: 'addGoalEntry', entry: { id: uid('ge'), goalId: goal.id, amount: adding ? v : -v, date, note: note.trim() || undefined } });
    }
    toast(adding ? `Added ${fmt(v)} to ${goal.name}.` : `Took ${fmt(v)} out of ${goal.name}.`);
    onClose();
  };

  const accountName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? '';

  return (
    <Modal title={adding ? `Add to ${goal.icon} ${goal.name}` : `Take from ${goal.icon} ${goal.name}`} description={`Currently saved: ${fmt(saved)} of ${fmt(goal.target)}`} onClose={onClose} width="32rem">
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-medium text-ink">{adding ? 'Where is the money coming from?' : 'Where should the money go?'}</legend>
          {canMove && (
            <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors ${method === 'move' ? 'border-sage-deep bg-sage-soft/60' : 'border-line hover:bg-surface2'}`}>
              <input type="radio" name="method" checked={method === 'move'} onChange={() => setMethod('move')} className="mt-1 accent-[var(--c-sage-deep)]" />
              <span className="text-sm">
                <span className="font-medium text-ink">{adding ? 'Move it from my spending account' : 'Move it back to my spending account'}</span>
                <span className="block text-xs text-muted">Records a transfer between your accounts. It isn’t counted as income or spending.</span>
              </span>
            </label>
          )}
          <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors ${method === 'assign' ? 'border-sage-deep bg-sage-soft/60' : 'border-line hover:bg-surface2'}`}>
            <input type="radio" name="method" checked={method === 'assign'} onChange={() => setMethod('assign')} className="mt-1 accent-[var(--c-sage-deep)]" />
            <span className="text-sm">
              <span className="font-medium text-ink">{adding ? 'It’s already in my savings' : 'Keep it in savings, just release it from this goal'}</span>
              <span className="block text-xs text-muted">{adding ? 'Assigns money you’ve already saved to this goal. No cash moves.' : 'Frees the money for other goals. No cash moves.'}</span>
            </span>
          </label>
        </fieldset>

        {method === 'move' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={adding ? 'From' : 'To'}>
              <Select value={fromId} onChange={(e) => setFromId(e.target.value)}>
                {spending.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label={adding ? 'Into' : 'Out of'}>
              <Select value={toId} onChange={(e) => setToId(e.target.value)}>
                {savings.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Amount" required error={error}>
            <MoneyInput value={amount} onChange={(v) => { setAmount(v); setError(null); }} currency={currency} data-autofocus />
          </Field>
          <Field label="Date" required>
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Note">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" maxLength={120} />
        </Field>

        {method === 'move' && <p className="rounded-xl bg-surface2 px-3 py-2 text-xs text-muted">{accountName(adding ? fromId : toId)} → {accountName(adding ? toId : fromId)}. Your total balance stays the same.</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">{adding ? 'Add to goal' : 'Take out'}</Button>
        </div>
      </form>
    </Modal>
  );
}
