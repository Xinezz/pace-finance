import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Sparkles, Trash2, Zap } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { distinctTags } from '../../domain/calc';
import { suggestCategory } from '../../domain/categorize';
import { isValidDateStr } from '../../domain/dates';
import { uid } from '../../domain/ids';
import { minorToInput, parseAmount } from '../../domain/money';
import { SPECIAL, type CategorySource, type Transaction, type TxType } from '../../domain/types';
import { useFeedback } from '../../state/feedback';
import { useStore } from '../../state/store';
import type { TxModalState } from '../../state/ui';
import { CategoryField } from '../category/CategoryPicker';
import { Button } from '../ui/Button';
import { Field, MoneyInput, Select, TagInput, TextInput, Textarea } from '../ui/Form';
import { Modal } from '../ui/Modal';

const TYPES: { value: TxType; label: string; icon: typeof ArrowUpRight; tint: string }[] = [
  { value: 'expense', label: 'Expense', icon: ArrowUpRight, tint: 'text-peach-deep' },
  { value: 'income', label: 'Income', icon: ArrowDownLeft, tint: 'text-sage-deep' },
  { value: 'transfer', label: 'Savings transfer', icon: ArrowRightLeft, tint: 'text-butter-deep' },
];

interface Props {
  state: TxModalState;
  onClose: () => void;
}

export function TransactionModal({ state, onClose }: Props) {
  const { data, dispatch, today, undo } = useStore();
  const { toast, confirm } = useFeedback();
  const currency = data.settings.currency;
  const existing = state.mode === 'edit' ? data.transactions.find((t) => t.id === state.id) : undefined;
  const seed = existing ?? state.prefill;

  const spending = data.accounts.filter((a) => a.kind === 'spending');
  const savings = data.accounts.filter((a) => a.kind === 'savings');
  const defaultFrom = spending[0]?.id ?? data.accounts[0]?.id ?? '';
  const defaultTo = savings[0]?.id ?? data.accounts.find((a) => a.id !== defaultFrom)?.id ?? '';

  const [type, setType] = useState<TxType>(seed?.type ?? 'expense');
  const [description, setDescription] = useState(seed?.description ?? '');
  const [amount, setAmount] = useState(seed?.amount ? minorToInput(seed.amount, currency) : '');
  const [date, setDate] = useState(seed?.date ?? today);
  const [categoryId, setCategoryId] = useState(seed?.categoryId ?? SPECIAL.other);
  const [categorySource, setCategorySource] = useState<CategorySource>(seed?.categorySource ?? 'none');
  const [paymentMethod, setPaymentMethod] = useState(seed?.paymentMethod ?? '');
  const [accountId, setAccountId] = useState(seed?.accountId ?? defaultFrom);
  const [toAccountId, setToAccountId] = useState(seed?.toAccountId ?? defaultTo);
  const [goalId, setGoalId] = useState(seed?.goalId ?? '');
  const [refund, setRefund] = useState(!!seed?.refund);
  const [tags, setTags] = useState<string[]>(seed?.tags ?? []);
  const [notes, setNotes] = useState(seed?.notes ?? '');
  const [saveAsQuick, setSaveAsQuick] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const descRef = useRef<HTMLInputElement>(null);

  const tagSuggestions = useMemo(() => distinctTags(data.transactions), [data.transactions]);

  /** Keep the category in step with the description until the user (or an earlier manual choice) takes over. */
  const resuggest = (desc: string, t: TxType) => {
    if (categorySource === 'manual' || t === 'transfer') return;
    const s = suggestCategory(desc, t, data);
    setCategoryId(s.categoryId);
    setCategorySource(s.source);
  };

  const changeType = (t: TxType) => {
    setType(t);
    setErrors({});
    if (t === 'transfer') {
      setCategoryId(SPECIAL.savings);
      setCategorySource('rule');
      if (!description.trim()) setDescription('Transfer to savings');
    } else {
      // A manual choice only survives if it still makes sense for the new type.
      const cat = data.categories.find((c) => c.id === categoryId);
      const stillValid = cat && (cat.type === 'both' || cat.type === t);
      if (categorySource === 'manual' && stillValid) return;
      const s = suggestCategory(description, t, data);
      setCategoryId(s.categoryId);
      setCategorySource(s.source);
    }
  };

  const applyQuick = (qid: string) => {
    const q = data.quickActions.find((x) => x.id === qid);
    if (!q) return;
    setType(q.type);
    setDescription(q.description);
    if (q.amount) setAmount(minorToInput(q.amount, currency));
    setCategoryId(q.categoryId);
    setCategorySource(q.type === 'transfer' ? 'rule' : 'manual');
    if (q.paymentMethod) setPaymentMethod(q.paymentMethod);
    setErrors({});
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!description.trim()) e.description = 'Add a short description.';
    else if (description.trim().length > 120) e.description = 'Keep it under 120 characters.';
    const minor = parseAmount(amount, currency);
    if (minor === null) e.amount = amount.trim() ? 'That doesn’t look like an amount.' : 'Enter an amount.';
    else if (minor <= 0) e.amount = 'The amount must be more than zero.';
    else if (minor > 99_999_999_999) e.amount = 'That’s larger than we can store.';
    if (!isValidDateStr(date)) e.date = 'Pick a valid date.';
    if (type === 'transfer') {
      if (!accountId || !toAccountId) e.toAccountId = 'Choose both accounts.';
      else if (accountId === toAccountId) e.toAccountId = 'Choose two different accounts.';
    }
    setErrors(e);
    return { ok: Object.keys(e).length === 0, minor: minor ?? 0 };
  };

  const buildTx = (minor: number): Transaction => {
    const nowTs = Date.now();
    const base: Transaction = {
      id: existing?.id ?? uid('tx'),
      type,
      description: description.trim(),
      amount: minor,
      date,
      categoryId: type === 'transfer' ? SPECIAL.savings : categoryId,
      categorySource: type === 'transfer' ? 'rule' : categorySource,
      notes: notes.trim() || undefined,
      paymentMethod: paymentMethod || undefined,
      tags,
      accountId: accountId || defaultFrom,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      goalId: type === 'transfer' && goalId ? goalId : undefined,
      refund: type === 'expense' && refund ? true : undefined,
      isDemo: existing?.isDemo,
      importHash: existing?.importHash,
      createdAt: existing?.createdAt ?? nowTs,
      updatedAt: nowTs,
    };
    return base;
  };

  const submit = (another: boolean) => (ev?: FormEvent) => {
    ev?.preventDefault();
    const { ok, minor } = validate();
    if (!ok) return;
    setBusy(true);
    const tx = buildTx(minor);
    if (existing) dispatch({ type: 'updateTx', id: existing.id, patch: tx });
    else dispatch({ type: 'addTx', tx });

    if (saveAsQuick && !existing) {
      dispatch({
        type: 'addQuickAction',
        action: { id: uid('qa'), label: tx.description.slice(0, 14), emoji: data.categories.find((c) => c.id === tx.categoryId)?.icon ?? '⚡', type: tx.type, description: tx.description, amount: tx.amount, categoryId: tx.categoryId, paymentMethod: tx.paymentMethod },
      });
    }

    if (existing) toast('Changes saved.');
    else if (tx.type !== 'transfer' && tx.categorySource === 'none') {
      toast(`Added “${tx.description}”. It’s waiting for a category under Needs Your Attention.`, { actions: [{ label: 'Undo', onClick: () => dispatch({ type: 'deleteTxs', ids: [tx.id] }) }] });
    } else toast(`Added “${tx.description}”.`, { actions: [{ label: 'Undo', onClick: () => dispatch({ type: 'deleteTxs', ids: [tx.id] }) }] });

    if (another) {
      setDescription('');
      setAmount('');
      setNotes('');
      setTags([]);
      setRefund(false);
      setCategorySource('none');
      setCategoryId(type === 'transfer' ? SPECIAL.savings : SPECIAL.other);
      setSaveAsQuick(false);
      setBusy(false);
      descRef.current?.focus();
    } else onClose();
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirm({ title: 'Delete this transaction?', tone: 'danger', confirmLabel: 'Delete', message: <>“{existing.description}” will be removed and your totals will update. You can undo right after.</> });
    if (!ok) return;
    dispatch({ type: 'deleteTxs', ids: [existing.id] }, { undoable: true });
    toast('Transaction deleted.', { actions: [{ label: 'Undo', onClick: () => undo() }] });
    onClose();
  };

  const isTransfer = type === 'transfer';
  const fromKind = data.accounts.find((a) => a.id === accountId)?.kind;
  const toKind = data.accounts.find((a) => a.id === toAccountId)?.kind;
  const intoSavings = fromKind !== 'savings' && toKind === 'savings';
  const outOfSavings = fromKind === 'savings' && toKind !== 'savings';
  const suggestedNote =
    !isTransfer && (categorySource === 'auto' || categorySource === 'rule')
      ? categorySource === 'rule'
        ? 'Matched a preference you saved.'
        : 'Suggested from the description. Change it any time.'
      : null;

  return (
    <Modal title={existing ? 'Edit transaction' : 'Add a transaction'} onClose={onClose} width="36rem">
      <form onSubmit={submit(false)} noValidate className="flex flex-col gap-5">
        {!existing && data.quickActions.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              <Zap size={12} aria-hidden /> Quick add
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.quickActions.map((q) => (
                <button key={q.id} type="button" onClick={() => applyQuick(q.id)} className="inline-flex items-center gap-1.5 rounded-full border border-line2 bg-surface px-3 py-1.5 text-[13px] text-body transition-colors hover:bg-sage-soft">
                  <span aria-hidden>{q.emoji}</span>
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div role="radiogroup" aria-label="Transaction type" className="grid grid-cols-3 gap-1.5 rounded-2xl bg-surface2 p-1">
          {TYPES.map((t) => {
            const Icon = t.icon;
            const active = type === t.value;
            return (
              <button key={t.value} type="button" role="radio" aria-checked={active} onClick={() => changeType(t.value)} className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[13px] font-medium transition-all ${active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
                <Icon size={15} className={active ? t.tint : ''} aria-hidden />
                {t.value === 'transfer' ? (
                  <span className="truncate">
                    <span className="sm:hidden">Savings</span>
                    <span className="hidden sm:inline">Savings transfer</span>
                  </span>
                ) : (
                  <span className="truncate">{t.label}</span>
                )}
              </button>
            );
          })}
        </div>

        <Field label="Description" required error={errors.description}>
          <TextInput
            ref={descRef}
            value={description}
            maxLength={120}
            placeholder={type === 'income' ? 'e.g. Salary, freelance project' : 'e.g. Lunch, ABC Store, Grab ride'}
            onChange={(e) => {
              setDescription(e.target.value);
              resuggest(e.target.value, type);
            }}
            data-autofocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" required error={errors.amount}>
            <MoneyInput value={amount} onChange={setAmount} currency={currency} />
          </Field>
          <Field label="Date" required error={errors.date}>
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        {isTransfer ? (
          <div className="flex flex-col gap-4 rounded-2xl border border-butter/60 bg-butter-soft/60 p-4">
            <p className="text-[13px] leading-relaxed text-butter-deep">This moves money between your own accounts. It changes balances, but it isn’t counted as income or spending.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From" required>
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {data.accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="To" required error={errors.toAccountId}>
                <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                  {data.accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            {data.goals.length > 0 && (intoSavings || outOfSavings) && (
              <Field label={intoSavings ? 'Add to a savings goal' : 'Take out of a savings goal'} hint={intoSavings ? 'Counts toward the goal’s progress.' : 'Reduces the goal’s saved amount.'}>
                <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                  <option value="">Not linked to a goal</option>
                  {data.goals.map((g) => (
                    <option key={g.id} value={g.id}>{g.icon} {g.name}</option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        ) : (
          <>
            <Field label="Category" required hint={suggestedNote ? <span className="inline-flex items-center gap-1"><Sparkles size={11} aria-hidden /> {suggestedNote}</span> : categorySource === 'none' ? 'Not sure yet? Leave it. We’ll keep it in Needs Your Attention.' : undefined}>
              <CategoryField
                txType={type}
                value={categoryId}
                onChange={(cid) => {
                  setCategoryId(cid);
                  setCategorySource('manual');
                }}
              />
            </Field>
            {type === 'expense' && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface2 px-3 py-2.5 text-sm">
                <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--c-sage-deep)]" />
                <span>
                  <span className="font-medium text-ink">This is a refund</span>
                  <span className="block text-xs text-muted">Money coming back. It reduces spending in the category instead of counting as income.</span>
                </span>
              </label>
            )}
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {!isTransfer && (
            <Field label="Payment method">
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="">Not specified</option>
                {data.settings.paymentMethods.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
                {paymentMethod && !data.settings.paymentMethods.includes(paymentMethod) && <option value={paymentMethod}>{paymentMethod}</option>}
              </Select>
            </Field>
          )}
          {!isTransfer && spending.length > 1 && (
            <Field label="Account">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} placeholder="Anything you want to remember" />
        </Field>

        {!existing && (
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted">
            <input type="checkbox" checked={saveAsQuick} onChange={(e) => setSaveAsQuick(e.target.checked)} className="h-4 w-4 accent-[var(--c-sage-deep)]" />
            Save this as a quick action for next time
          </label>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <div>
            {existing && (
              <Button variant="danger" onClick={remove} icon={<Trash2 size={15} />}>
                Delete
              </Button>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            {!existing && (
              <Button variant="soft" onClick={() => submit(true)()} disabled={busy}>
                Save & add another
              </Button>
            )}
            <Button type="submit" variant="primary" loading={busy}>
              {existing ? 'Save changes' : 'Add transaction'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
