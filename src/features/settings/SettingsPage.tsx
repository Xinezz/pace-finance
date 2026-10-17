import { Database, Download, FileUp, HardDrive, LogOut, Pencil, Plus, RotateCcw, ShieldCheck, Sparkles, Trash2, Upload, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { PasswordInput, StrengthMeter } from '../../auth/PasswordFields';
import { checkPassword } from '../../auth/validate';
import { cloudConfigProblem } from '../../cloud';
import { createBestStore } from '../../storage/dataStore';
import { CategoryEditorModal } from '../../components/category/CategoryEditor';
import { CategoryChip, CategoryIcon } from '../../components/category/CategoryChip';
import { ImportWizard } from '../../components/import/ImportWizard';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, CardHeader, PageHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Feedback';
import { Field, MoneyInput, Segmented, Select, Switch, TextInput } from '../../components/ui/Form';
import { Modal } from '../../components/ui/Modal';
import { categoriesForType, makeRule, normalizeDescription } from '../../domain/categorize';
import { createDemoData } from '../../domain/demo';
import { uid } from '../../domain/ids';
import { transactionsToCsv } from '../../domain/importer';
import { CURRENCIES, currencyDecimals, minorToInput, parseAmount } from '../../domain/money';
import type { Account, AccountKind, Category, QuickAction, ThemeSetting, TxType } from '../../domain/types';
import { useExportBackup } from '../../hooks/useBackup';
import { downloadText } from '../../lib/download';
import { parseBackup } from '../../storage/sanitize';
import { useFeedback } from '../../state/feedback';
import { useMoney, useStore } from '../../state/store';
import { useUi } from '../../state/ui';

function Section({ id, title, subtitle, icon, children, action }: { id: string; title: string; subtitle?: string; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <Card id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <CardHeader id={`${id}-title`} title={title} subtitle={subtitle} icon={icon} action={action} />
      {children}
    </Card>
  );
}

/* ---------------- account ---------------- */

function AccountSection() {
  const auth = useAuth();
  const { toast, confirm } = useFeedback();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [hasLocal, setHasLocal] = useState(false);

  // Is there data on this device from before signing in? (It is never touched automatically.)
  useEffect(() => {
    if (auth.status !== 'signed-in') return;
    let alive = true;
    createBestStore()
      .then(({ store }) => store.load())
      .then((copy) => alive && setHasLocal(!!copy && copy.meta.mode !== 'new'))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [auth.status]);

  if (auth.status === 'unconfigured') {
    const problem = cloudConfigProblem();
    return (
      <Section id="account" title="Account" subtitle="Sign-in isn’t set up on this site" icon={<UserRound size={17} />}>
        {problem && (
          <p role="alert" className="mb-3 rounded-xl border border-peach/60 bg-peach-soft px-3 py-2.5 text-sm font-medium text-peach-deep">
            Accounts are switched off because of a setup problem: {problem}
          </p>
        )}
        <p className="text-sm leading-relaxed text-muted">
          Pace is running on this device only: your data stays in this browser and nobody else can reach it. To add accounts and sync across devices, connect a Supabase project (see <code className="rounded bg-surface2 px-1.5 py-0.5 text-ink">supabase/SETUP.md</code>).
        </p>
      </Section>
    );
  }

  if (auth.status === 'guest') {
    return (
      <Section id="account" title="Account" subtitle="You’re using Pace without an account" icon={<UserRound size={17} />}>
        <p className="mb-4 text-sm leading-relaxed text-muted">Your data stays only in this browser. Create an account to keep it safe in the cloud and use Pace on any device.</p>
        <Button variant="primary" onClick={auth.leaveGuestMode}>Sign in or create an account</Button>
      </Section>
    );
  }

  if (auth.status !== 'signed-in' || !auth.user) return null;
  const email = auth.user.email;

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    const check = checkPassword(pw, email);
    if (!check.ok) return setPwError(check.issues[0]);
    if (pw !== pw2) return setPwError('The two passwords don’t match.');
    setPwError(null);
    setPwBusy(true);
    const res = await auth.updatePassword(pw);
    setPwBusy(false);
    if (!res.ok) return setPwError(res.error ?? 'We couldn’t change the password.');
    setPw('');
    setPw2('');
    toast('Password changed.');
  };

  const eraseLocal = async () => {
    const ok = await confirm({
      title: 'Erase the copy on this device?',
      tone: 'danger',
      confirmLabel: 'Erase from this device',
      message: 'This removes the data that was stored in this browser from before you signed in. Your account’s data in the cloud isn’t affected.',
    });
    if (!ok) return;
    const { store } = await createBestStore();
    await store.clear();
    setHasLocal(false);
    toast('Erased from this device.');
  };

  const deleteAccount = async () => {
    const ok = await confirm({
      title: 'Delete your account?',
      tone: 'danger',
      confirmLabel: 'Delete everything',
      message: (
        <>
          <p>This permanently deletes your login and <strong>all of your data</strong> in the cloud: transactions, goals, budgets, everything. It can’t be undone.</p>
          <p className="mt-2 text-muted">Download a backup first if you might want it later.</p>
        </>
      ),
    });
    if (!ok) return;
    setDeleting(true);
    const res = await auth.deleteAccount();
    setDeleting(false);
    if (!res.ok) toast(res.error ?? 'We couldn’t delete the account.', { kind: 'error' });
  };

  return (
    <Section id="account" title="Account" subtitle="Signed in. Your data is saved to your account and synced across your devices." icon={<UserRound size={17} />} action={<Button size="sm" icon={<LogOut size={14} />} onClick={() => void auth.signOut()}>Sign out</Button>}>
      <div className="flex flex-col gap-6">
        <p className="text-sm text-muted">
          Signed in as <strong className="text-ink">{email}</strong>
        </p>

        <form onSubmit={changePassword} noValidate className="grid gap-4 sm:max-w-md">
          <p className="font-medium text-ink">Change password</p>
          <Field label="New password" required error={pwError}>
            <PasswordInput value={pw} onChange={setPw} autoComplete="new-password" />
          </Field>
          <StrengthMeter password={pw} email={email} />
          <Field label="Confirm new password" required>
            <PasswordInput value={pw2} onChange={setPw2} autoComplete="new-password" />
          </Field>
          <div>
            <Button type="submit" variant="primary" loading={pwBusy} disabled={!pw}>Change password</Button>
          </div>
        </form>

        {hasLocal && (
          <div className="rounded-2xl bg-surface2 p-4">
            <p className="font-medium text-ink">Data on this device</p>
            <p className="mt-1 text-sm text-muted">This browser still holds data from before you signed in. If it’s a shared computer, you may want to erase it.</p>
            <Button className="mt-3" onClick={eraseLocal}>Erase the copy on this device</Button>
          </div>
        )}

        <div className="rounded-2xl border border-peach/50 bg-peach-soft/50 p-4">
          <p className="font-medium text-peach-deep">Delete account</p>
          <p className="mt-1 text-sm text-body">Permanently deletes your login and everything saved in your account.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Field label={`Type ${email} to confirm`} required className="min-w-64 flex-1">
              <TextInput value={deleteText} onChange={(e) => setDeleteText(e.target.value)} autoComplete="off" spellCheck={false} />
            </Field>
            <Button variant="danger" icon={<Trash2 size={15} />} loading={deleting} disabled={deleteText.trim().toLowerCase() !== email.toLowerCase()} onClick={deleteAccount}>
              Delete my account
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ---------------- accounts ---------------- */

function AccountsSection() {
  const { data, dispatch } = useStore();
  const { currency, fmt } = useMoney();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [kind, setKind] = useState<AccountKind>('spending');
  const [error, setError] = useState<string | null>(null);

  const begin = (a?: Account) => {
    setEditing(a?.id ?? 'new');
    setName(a?.name ?? '');
    setBalance(a ? minorToInput(a.openingBalance, currency) : '');
    setKind(a?.kind ?? 'spending');
    setError(null);
  };

  const save = () => {
    const v = balance.trim() ? parseAmount(balance, currency) : 0;
    if (!name.trim()) return setError('Give the account a name.');
    if (v === null) return setError('That doesn’t look like an amount.');
    if (editing === 'new') dispatch({ type: 'addAccount', account: { id: uid('acc'), name: name.trim(), kind, openingBalance: v } });
    else if (editing) dispatch({ type: 'updateAccount', id: editing, patch: { name, openingBalance: v } });
    toast('Account saved.');
    setEditing(null);
  };

  const remove = async (a: Account) => {
    const used = data.transactions.some((t) => t.accountId === a.id || t.toAccountId === a.id);
    if (used) return toast('This account has transactions, so it can’t be deleted. Rename it instead.', { kind: 'info' });
    if (a.kind === 'spending' && data.accounts.filter((x) => x.kind === 'spending').length <= 1) return toast('You need at least one spending account.', { kind: 'info' });
    const ok = await confirm({ title: `Delete “${a.name}”?`, tone: 'danger', confirmLabel: 'Delete', message: 'This account has no transactions, so nothing else changes.' });
    if (ok) dispatch({ type: 'deleteAccount', id: a.id });
  };

  return (
    <Section id="accounts" title="Bank accounts" subtitle="Balance = opening balance + every transaction you record" icon={<HardDrive size={17} />} action={<Button size="sm" icon={<Plus size={14} />} onClick={() => begin()}>Add account</Button>}>
      <ul className="divide-y divide-line">
        {data.accounts.map((a) => (
          <li key={a.id} className="py-3">
            {editing === a.id ? null : (
              <div className="flex items-center gap-3">
                <span className={`grid h-9 w-9 place-items-center rounded-xl ${a.kind === 'savings' ? 'bg-butter-soft text-butter-deep' : 'bg-blue-soft text-blue-deep'}`} aria-hidden>{a.kind === 'savings' ? '🐷' : '💳'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{a.name} {a.isDemo && <Badge tone="butter">Demo</Badge>}</p>
                  <p className="text-xs text-muted">{a.kind === 'savings' ? 'Savings' : 'Spending'} · opening balance {fmt(a.openingBalance)}</p>
                </div>
                <IconButton label={`Edit ${a.name}`} size="sm" onClick={() => begin(a)}><Pencil size={14} /></IconButton>
                <IconButton label={`Delete ${a.name}`} size="sm" onClick={() => remove(a)}><Trash2 size={14} /></IconButton>
              </div>
            )}
          </li>
        ))}
      </ul>
      {editing && (
        <form className="mt-3 grid gap-3 rounded-2xl bg-surface2 p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Field label="Account name" required error={error}><TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={40} data-autofocus autoFocus /></Field>
          <Field label="Opening balance" hint="Money in the account before your first recorded transaction."><MoneyInput value={balance} onChange={setBalance} currency={currency} /></Field>
          {editing === 'new' && (
            <Field label="Type" required><Select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}><option value="spending">Spending (day to day)</option><option value="savings">Savings</option></Select></Field>
          )}
          <div className="flex items-end justify-end gap-2 sm:col-span-2"><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" variant="primary">Save account</Button></div>
        </form>
      )}
    </Section>
  );
}

/* ---------------- categories ---------------- */

function CategoriesSection() {
  const { data, dispatch } = useStore();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of data.transactions) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1);
    return m;
  }, [data.transactions]);

  const remove = async (c: Category) => {
    const n = counts.get(c.id) ?? 0;
    const ok = await confirm({
      title: `Delete “${c.name}”?`,
      tone: 'danger',
      confirmLabel: 'Delete category',
      message: n > 0 ? <>{n} transaction{n === 1 ? '' : 's'} will move back to <strong>Needs Your Attention</strong> so you can choose a new category. Its budget and remembered preferences are removed too.</> : 'No transactions use this category, so nothing else changes.',
    });
    if (!ok) return;
    dispatch({ type: 'deleteCategory', id: c.id }, { undoable: true });
    toast('Category deleted.');
  };

  return (
    <Section id="categories" title="Categories" subtitle="Rename, recolour, or add your own. Built-in categories keep their names." icon={<Sparkles size={17} />} action={<Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New category</Button>}>
      <ul className="grid gap-x-6 sm:grid-cols-2">
        {data.categories.map((c) => (
          <li key={c.id} className="flex items-center gap-3 border-b border-line py-2.5">
            <CategoryIcon category={c} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{c.name}</p>
              <p className="text-xs text-muted">{counts.get(c.id) ?? 0} transaction{(counts.get(c.id) ?? 0) === 1 ? '' : 's'} · {c.type === 'both' ? 'any' : c.type === 'transfer' ? 'savings' : c.type}</p>
            </div>
            <IconButton label={`Edit ${c.name}`} size="sm" onClick={() => setEditing(c)}><Pencil size={14} /></IconButton>
            {!c.builtin && <IconButton label={`Delete ${c.name}`} size="sm" onClick={() => remove(c)}><Trash2 size={14} /></IconButton>}
          </li>
        ))}
      </ul>
      {editing && <CategoryEditorModal category={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Section>
  );
}

/* ---------------- remembered preferences ---------------- */

function RulesSection() {
  const { data, dispatch } = useStore();
  const { toast } = useFeedback();
  const [pattern, setPattern] = useState('');
  const [categoryId, setCategoryId] = useState('shopping');
  const catMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const expenseCats = useMemo(() => categoriesForType(data.categories, 'expense'), [data.categories]);

  const add = () => {
    const key = normalizeDescription(pattern);
    if (key.length < 2) return toast('Type a word or two from the description, like “abc store”.', { kind: 'error' });
    dispatch({ type: 'addRule', rule: makeRule(key, categoryId), applyToExisting: true });
    toast(`Remembered. “${key}” now goes to ${catMap.get(categoryId)?.name}.`);
    setPattern('');
  };

  return (
    <Section id="rules" title="Remembered preferences" subtitle="When a description contains these words, new transactions go to the category you chose. Your manual choices are never overridden." icon={<ShieldCheck size={17} />}>
      {data.rules.length === 0 ? (
        <p className="mb-4 rounded-2xl bg-surface2 px-4 py-3 text-sm text-muted">Nothing remembered yet. When you categorize something by hand, Pace offers to remember it, and it shows up here.</p>
      ) : (
        <ul className="mb-4 divide-y divide-line">
          {data.rules.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="text-muted">Contains</span>
              <code className="rounded-lg bg-surface2 px-2 py-0.5 text-ink">{r.pattern}</code>
              <span className="text-muted">→</span>
              <CategoryChip category={catMap.get(r.categoryId)} size="sm" />
              <IconButton label={`Forget ${r.pattern}`} size="sm" className="ml-auto" onClick={() => dispatch({ type: 'deleteRule', id: r.id })}><X size={14} /></IconButton>
            </li>
          ))}
        </ul>
      )}
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <Field label="When the description contains" className="min-w-48 flex-1"><TextInput value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="e.g. abc store" /></Field>
        <Field label="Use category" className="min-w-48"><Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{expenseCats.filter((c) => c.id !== 'other').map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</Select></Field>
        <Button type="submit" variant="soft" icon={<Plus size={14} />}>Add</Button>
      </form>
    </Section>
  );
}

/* ---------------- quick actions & payment methods ---------------- */

function QuickSection() {
  const { data, dispatch } = useStore();
  const { currency, fmt } = useMoney();
  const { toast } = useFeedback();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [emoji, setEmoji] = useState('☕');
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('food');
  const [method, setMethod] = useState('');
  const [newMethod, setNewMethod] = useState('');

  const cats = categoriesForType(data.categories, type === 'transfer' ? 'expense' : type);
  const create = () => {
    if (!label.trim()) return toast('Give the quick action a name.', { kind: 'error' });
    const v = amount.trim() ? parseAmount(amount, currency) : undefined;
    if (v === null) return toast('That doesn’t look like an amount.', { kind: 'error' });
    const qa: QuickAction = { id: uid('qa'), label: label.trim(), emoji: [...emoji.trim()][0] ?? '⚡', type, description: label.trim(), amount: v && v > 0 ? v : undefined, categoryId: cats.some((c) => c.id === categoryId) ? categoryId : (cats[0]?.id ?? 'other'), paymentMethod: method || undefined };
    dispatch({ type: 'addQuickAction', action: qa });
    setAdding(false);
    setLabel('');
    setAmount('');
    toast('Quick action added.');
  };

  return (
    <>
      <Section id="quick" title="Quick actions" subtitle="One-tap shortcuts for the things you add all the time" icon={<Sparkles size={17} />} action={<Button size="sm" icon={<Plus size={14} />} onClick={() => setAdding((a) => !a)}>New</Button>}>
        <ul className="flex flex-wrap gap-2">
          {data.quickActions.map((q) => (
            <li key={q.id} className="inline-flex items-center gap-2 rounded-full border border-line2 bg-surface py-1 pl-3 pr-1 text-sm">
              <span aria-hidden>{q.emoji}</span> {q.label}{q.amount ? <span className="text-xs text-muted">{fmt(q.amount, { trimWhole: true })}</span> : null}
              <button type="button" aria-label={`Delete quick action ${q.label}`} className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-surface2 hover:text-ink" onClick={() => dispatch({ type: 'deleteQuickAction', id: q.id })}><X size={12} /></button>
            </li>
          ))}
          {data.quickActions.length === 0 && <li className="text-sm text-muted">No quick actions. Add one for your morning coffee or weekly shop.</li>}
        </ul>
        {adding && (
          <form className="mt-4 grid gap-3 rounded-2xl bg-surface2 p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); create(); }}>
            <Field label="Name" required><TextInput value={label} onChange={(e) => setLabel(e.target.value)} maxLength={20} placeholder="e.g. Bubble tea" data-autofocus /></Field>
            <Field label="Emoji"><TextInput value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} /></Field>
            <Field label="Type"><Select value={type} onChange={(e) => { const t = e.target.value as TxType; setType(t); setCategoryId(t === 'income' ? 'salary' : 'food'); }}><option value="expense">Expense</option><option value="income">Income</option></Select></Field>
            <Field label="Category"><Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</Select></Field>
            <Field label="Usual amount"><MoneyInput value={amount} onChange={setAmount} currency={currency} /></Field>
            <Field label="Payment method"><Select value={method} onChange={(e) => setMethod(e.target.value)}><option value="">Not specified</option>{data.settings.paymentMethods.map((m) => <option key={m}>{m}</option>)}</Select></Field>
            <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" variant="primary">Add quick action</Button></div>
          </form>
        )}
      </Section>

      <Section id="methods" title="Payment methods" subtitle="Shown when you add a transaction, and available as a filter">
        <ul className="mb-4 flex flex-wrap gap-2">
          {data.settings.paymentMethods.map((m) => (
            <li key={m} className="inline-flex items-center gap-1 rounded-full bg-surface2 py-1 pl-3 pr-1 text-sm text-body">
              {m}
              <button type="button" aria-label={`Remove ${m}`} className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink" onClick={() => dispatch({ type: 'updateSettings', patch: { paymentMethods: data.settings.paymentMethods.filter((x) => x !== m) } })}><X size={12} /></button>
            </li>
          ))}
        </ul>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = newMethod.trim(); if (v && !data.settings.paymentMethods.some((m) => m.toLowerCase() === v.toLowerCase())) dispatch({ type: 'updateSettings', patch: { paymentMethods: [...data.settings.paymentMethods, v] } }); setNewMethod(''); }}>
          <TextInput value={newMethod} onChange={(e) => setNewMethod(e.target.value)} placeholder="Add a payment method" aria-label="New payment method" maxLength={24} className="max-w-xs" />
          <Button type="submit" variant="soft">Add</Button>
        </form>
      </Section>
    </>
  );
}

/* ---------------- data ---------------- */

function DataSection() {
  const { data, dispatch, storeKind } = useStore();
  const { toast, confirm } = useFeedback();
  const { navigate } = useUi();
  const exportBackup = useExportBackup();
  const restoreRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [restoreInfo, setRestoreInfo] = useState<{ text: string; warnings: string[]; counts: { tx: number; goals: number; cats: number } } | null>(null);
  const demoCount = data.transactions.filter((t) => t.isDemo).length;
  const demoMode = data.meta.mode === 'demo';

  const onRestoreFile = async (file: File) => {
    try {
      const text = await file.text();
      const { data: parsed, warnings } = parseBackup(text);
      setRestoreInfo({ text, warnings, counts: { tx: parsed.transactions.length, goals: parsed.goals.length, cats: parsed.categories.filter((c) => !c.builtin).length } });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That backup could not be read.', { kind: 'error' });
    }
  };

  const doRestore = () => {
    if (!restoreInfo) return;
    try {
      const { data: parsed } = parseBackup(restoreInfo.text);
      dispatch({ type: 'replace', data: parsed });
      toast('Backup restored.');
      setRestoreInfo(null);
      navigate('/dashboard');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Restore failed.', { kind: 'error' });
    }
  };

  const clearDemo = async () => {
    const ok = await confirm({
      title: 'Clear the demo data?',
      tone: 'danger',
      confirmLabel: 'Clear demo data',
      message: <><p>This removes {demoCount} demo transactions, the demo goals, budgets and starting balances.</p><p className="mt-2 text-muted">Anything you added yourself, and any categories you created, stay.</p></>,
    });
    if (!ok) return;
    dispatch({ type: 'clearDemo' });
    toast('Demo data cleared.');
    navigate('/dashboard');
  };

  const resetDemo = async () => {
    const ok = await confirm({ title: 'Reset the demo data?', confirmLabel: 'Reset demo', message: 'This puts the demo data back exactly as it first appeared. Changes you made while exploring will be lost.' });
    if (!ok) return;
    const fresh = createDemoData();
    const mine = data.transactions.filter((t) => !t.isDemo);
    dispatch({ type: 'replace', data: { ...fresh, transactions: [...fresh.transactions, ...mine], categories: data.categories, settings: { ...fresh.settings, theme: data.settings.theme, currency: data.settings.currency } } });
    toast('Demo data reset.');
  };

  const startClean = async () => {
    const ok = await confirm({
      title: 'Start with a clean account?',
      tone: 'danger',
      confirmLabel: 'Erase and start clean',
      message: <><p>This permanently deletes <strong>everything</strong> in Pace {storeKind === 'cloud' ? 'in your account, on all of your devices' : 'on this device'}: transactions, goals, budgets, categories and settings.</p><p className="mt-2 text-muted">Download a backup first if there’s any chance you’ll want it back.</p></>,
    });
    if (!ok) return;
    dispatch({ type: 'startFresh' });
    toast('Clean slate. Let’s set things up.');
    navigate('/dashboard');
  };

  const loadDemo = async () => {
    const ok = await confirm({ title: 'Replace everything with demo data?', tone: 'danger', confirmLabel: 'Replace with demo', message: 'This swaps all of your data for sample data. Download a backup first if you want to keep what you have.' });
    if (!ok) return;
    dispatch({ type: 'replace', data: createDemoData() });
    toast('Demo data loaded.');
    navigate('/dashboard');
  };

  return (
    <Section id="data" title="Your data" subtitle={storeKind === 'cloud' ? 'Saved to your account. Back it up whenever you like.' : 'Stored only in this browser. Back it up whenever you like.'} icon={<Database size={17} />}>
      <div className="flex flex-col gap-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line p-4">
            <p className="font-medium text-ink">Backup</p>
            <p className="mt-1 text-sm text-muted">Download everything as one JSON file, and restore it on any device.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button icon={<Download size={15} />} onClick={exportBackup}>Download backup</Button>
              <Button icon={<Upload size={15} />} onClick={() => restoreRef.current?.click()}>Restore…</Button>
              <input ref={restoreRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Backup file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onRestoreFile(f); e.target.value = ''; }} />
            </div>
          </div>
          <div id="import" className="scroll-mt-24 rounded-2xl border border-line p-4">
            <p className="font-medium text-ink">Spreadsheet (CSV)</p>
            <p className="mt-1 text-sm text-muted">Import from your bank with a preview and column matching, or export your transactions.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button icon={<FileUp size={15} />} onClick={() => setImporting(true)}>Import CSV</Button>
              <Button icon={<Download size={15} />} disabled={data.transactions.length === 0} onClick={() => { downloadText(`pace-transactions-${new Date().toISOString().slice(0, 10)}.csv`, transactionsToCsv(data.transactions, data), 'text/csv'); toast('Exported all transactions.'); }}>Export all</Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-surface2 p-4">
          <p className="flex items-center gap-2 font-medium text-ink">Demo data {demoMode && <Badge tone="butter">Active</Badge>}</p>
          <p className="mt-1 text-sm text-muted">{demoMode ? `You’re exploring ${demoCount} sample transactions. They’re marked “Demo” throughout the app.` : 'You’re using your own data.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {demoMode ? (
              <>
                <Button icon={<RotateCcw size={15} />} onClick={resetDemo}>Reset demo data</Button>
                <Button variant="primary" onClick={clearDemo}>Clear demo & use my own data</Button>
              </>
            ) : (
              <Button onClick={loadDemo}>Load demo data</Button>
            )}
            <Button variant="danger" icon={<Trash2 size={15} />} onClick={startClean}>Start with a clean account</Button>
          </div>
        </div>

        <p className="flex items-center gap-2 text-xs text-muted"><HardDrive size={14} /> {storeKind === 'cloud' ? 'Saved to your account in the cloud and synced across your devices. A backup file is still a good idea.' : <>Saved in this browser using {storeKind === 'indexeddb' ? 'IndexedDB' : storeKind === 'localstorage' ? 'localStorage' : 'temporary memory (not persistent!)'}. Clearing site data for this page will erase it, so keep a backup.</>}</p>
      </div>

      {importing && <ImportWizard onClose={() => setImporting(false)} />}
      {restoreInfo && (
        <Modal title="Restore this backup?" onClose={() => setRestoreInfo(null)} width="28rem">
          <p className="text-sm leading-relaxed text-body">This will <strong>replace everything currently in Pace</strong> with the backup: {restoreInfo.counts.tx} transactions, {restoreInfo.counts.goals} goals and {restoreInfo.counts.cats} custom categories.</p>
          {restoreInfo.warnings.length > 0 && <ul className="mt-3 list-disc rounded-xl bg-butter-soft py-2 pl-7 pr-3 text-sm text-butter-deep">{restoreInfo.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setRestoreInfo(null)}>Cancel</Button><Button variant="danger" onClick={doRestore}>Replace my data</Button></div>
        </Modal>
      )}
    </Section>
  );
}

/* ---------------- preferences ---------------- */

function PreferencesSection() {
  const { data, dispatch } = useStore();
  const { toast, confirm } = useFeedback();
  const s = data.settings;
  const [name, setName] = useState(s.userName);

  const changeCurrency = async (code: string) => {
    if (code === s.currency) return;
    const from = currencyDecimals(s.currency);
    const to = currencyDecimals(code);
    if (data.transactions.length > 0 || data.accounts.some((a) => a.openingBalance !== 0)) {
      const ok = await confirm({
        title: `Switch to ${code}?`,
        confirmLabel: `Use ${code}`,
        message: <><p>This changes how amounts are <strong>displayed</strong>. Your numbers are <strong>not converted</strong>: 100.00 {s.currency} becomes 100.00 {code}.</p>{from !== to && <p className="mt-2 text-muted">{code} uses {to} decimal places, so stored amounts are rescaled to keep the same displayed numbers.</p>}</>,
      });
      if (!ok) return;
    }
    dispatch({ type: 'changeCurrency', currency: code });
    toast(`Currency set to ${code}.`);
  };

  return (
    <Section id="preferences" title="Preferences" subtitle="Make Pace feel like yours">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" hint="Used in the greeting.">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== s.userName && dispatch({ type: 'updateSettings', patch: { userName: name.trim() } })} maxLength={40} />
        </Field>
        <Field label="Currency" required hint="Display only. Amounts aren't converted.">
          <Select value={s.currency} onChange={(e) => void changeCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
          </Select>
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink">Theme</span>
          <Segmented<ThemeSetting> ariaLabel="Theme" value={s.theme} onChange={(theme) => dispatch({ type: 'updateSettings', patch: { theme } })} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'Match device' }]} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink">Week starts on</span>
          <Segmented<'1' | '0'> ariaLabel="First day of the week" value={String(s.weekStartsOn) as '1' | '0'} onChange={(v) => dispatch({ type: 'updateSettings', patch: { weekStartsOn: v === '0' ? 0 : 1 } })} options={[{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }]} />
        </div>
      </div>
      <div className="mt-6 border-t border-line pt-5">
        <Switch label="Suggest categories from the description" description="Pace can guess well-known merchants like Grab or NTUC. Guesses are labelled “auto” and you can confirm or change them. Turn this off to categorize everything yourself. Your own choices and remembered preferences always win either way." checked={s.autoSuggest} onChange={(autoSuggest) => dispatch({ type: 'updateSettings', patch: { autoSuggest } })} />
      </div>
    </Section>
  );
}

function AboutSection() {
  const { status } = useAuth();
  return (
    <Section id="about" title="About Pace" subtitle="Local-first by design">
      <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
        <li>
          {status === 'signed-in'
            ? 'Your data is saved to your private account in the cloud, protected so only you can read it. There are no trackers and no bank connections.'
            : 'Everything is stored in this browser on this device. There are no servers, trackers or bank connections.'}
        </li>
        <li>Money is stored as whole minor units (cents), so totals never pick up rounding errors.</li>
        <li>Keyboard: press <kbd className="rounded bg-surface2 px-1.5 text-ink">N</kbd> anywhere to add a transaction. In the categorize flow use <kbd className="rounded bg-surface2 px-1.5 text-ink">1</kbd>–<kbd className="rounded bg-surface2 px-1.5 text-ink">9</kbd> to pick and <kbd className="rounded bg-surface2 px-1.5 text-ink">S</kbd> to skip.</li>
        <li>Use one browser tab at a time. Two tabs editing at once can overwrite each other.</li>
      </ul>
    </Section>
  );
}

export function SettingsPage() {
  const { route } = useUi();
  const section = route.params.get('section');
  useEffect(() => {
    if (section) window.setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }, [section]);

  const links = [['preferences', 'Preferences'], ['account', 'Account'], ['accounts', 'Bank accounts'], ['categories', 'Categories'], ['rules', 'Remembered'], ['quick', 'Quick actions'], ['data', 'Your data'], ['about', 'About']];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" subtitle="Preferences, categories, accounts and your data." />
      <nav aria-label="Settings sections" className="no-print -mt-2 flex flex-wrap gap-2">
        {links.map(([id, label]) => (
          <button key={id} type="button" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="rounded-full border border-line2 bg-surface px-3 py-1.5 text-sm text-body transition-colors hover:bg-sage-soft">{label}</button>
        ))}
      </nav>
      <PreferencesSection />
      <AccountSection />
      <AccountsSection />
      <CategoriesSection />
      <RulesSection />
      <QuickSection />
      <DataSection />
      <AboutSection />
    </div>
  );
}
