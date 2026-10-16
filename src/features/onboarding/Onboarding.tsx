import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useState } from 'react';
import { Logo } from '../../components/layout/nav';
import { CategoryIcon } from '../../components/category/CategoryChip';
import { Button } from '../../components/ui/Button';
import { Field, MoneyInput, Select, TextInput } from '../../components/ui/Form';
import { CURRENCIES, parseAmount } from '../../domain/money';
import type { Budget } from '../../domain/types';
import { useStore } from '../../state/store';
import { useUi } from '../../state/ui';

const BUDGET_CATEGORIES = ['food', 'groceries', 'transport', 'shopping', 'entertainment'];
const STEPS = ['About you', 'Starting balances', 'Monthly plan'];

export function Onboarding() {
  const { data, dispatch } = useStore();
  const { navigate } = useUi();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(data.settings.userName);
  const [currency, setCurrency] = useState(data.settings.currency);
  const [spending, setSpending] = useState('');
  const [savings, setSavings] = useState('');
  const [target, setTarget] = useState('');
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const parseOptional = (raw: string, key: string, allowNegative = false): number | null | 'bad' => {
    if (!raw.trim()) return null;
    const v = parseAmount(raw, currency);
    if (v === null || (!allowNegative && v < 0)) {
      setErrors((e) => ({ ...e, [key]: 'That doesn’t look like an amount.' }));
      return 'bad';
    }
    return v;
  };

  const next = () => {
    setErrors({});
    if (step === 1) {
      const a = parseOptional(spending, 'spending', true);
      const b = parseOptional(savings, 'savings', true);
      if (a === 'bad' || b === 'bad') return;
    }
    setStep((s) => s + 1);
  };

  const finish = (skipPlan = false) => {
    const spendingBalance = parseAmount(spending, currency) ?? 0;
    const savingsBalance = parseAmount(savings, currency) ?? 0;
    const planned: Budget[] = [];
    let savingsTarget = 0;
    if (!skipPlan) {
      for (const [categoryId, raw] of Object.entries(budgets)) {
        const v = raw.trim() ? parseAmount(raw, currency) : null;
        if (v && v > 0) planned.push({ categoryId, amount: v });
      }
      savingsTarget = Math.max(0, parseAmount(target, currency) ?? 0);
    }
    dispatch({ type: 'finishOnboarding', payload: { userName: name, currency, spendingBalance, savingsBalance, budgets: planned, monthlySavingsTarget: savingsTarget } });
    navigate('/dashboard');
  };

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-blue/25 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-sage/25 blur-3xl" />
      </div>
      <main className="page-enter w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo size={32} />
            <span className="font-serif text-2xl text-ink">Pace</span>
          </div>
          <button type="button" className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline" onClick={() => finish(true)}>
            Skip setup
          </button>
        </div>

        <ol className="mb-5 flex items-center gap-2" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2" aria-current={i === step ? 'step' : undefined}>
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors ${i < step ? 'bg-sage-deep text-white' : i === step ? 'bg-primary text-on-primary' : 'bg-surface2 text-muted'}`}>
                {i < step ? <Check size={13} /> : i + 1}
              </span>
              <span className={`hidden truncate text-xs sm:block ${i === step ? 'font-medium text-ink' : 'text-muted'}`}>{s}</span>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-line2" />}
            </li>
          ))}
        </ol>

        <div className="rounded-[1.5rem] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
          {step === 0 && (
            <section className="flex flex-col gap-5" aria-labelledby="ob-0">
              <div>
                <h1 id="ob-0" className="font-serif text-3xl text-ink">Let’s make it yours</h1>
                <p className="mt-1.5 text-sm text-muted">Just two things to start. You can change both later.</p>
              </div>
              <Field label="What should we call you?">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" maxLength={40} data-autofocus autoFocus />
              </Field>
              <Field label="Currency" required hint="Used everywhere in the app. Singapore dollars by default.">
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
                  ))}
                </Select>
              </Field>
            </section>
          )}

          {step === 1 && (
            <section className="flex flex-col gap-5" aria-labelledby="ob-1">
              <div>
                <h1 id="ob-1" className="font-serif text-3xl text-ink">Where do you stand today?</h1>
                <p className="mt-1.5 text-sm text-muted">A rough number is fine. Balances are worked out from this starting point plus the transactions you record.</p>
              </div>
              <Field label="Main account balance" hint="Money you spend from day to day." error={errors.spending}>
                <MoneyInput value={spending} onChange={setSpending} currency={currency} autoFocus />
              </Field>
              <Field label="Savings balance" hint="Money set aside in savings accounts." error={errors.savings}>
                <MoneyInput value={savings} onChange={setSavings} currency={currency} />
              </Field>
            </section>
          )}

          {step === 2 && (
            <section className="flex flex-col gap-5" aria-labelledby="ob-2">
              <div>
                <h1 id="ob-2" className="font-serif text-3xl text-ink">A gentle monthly plan</h1>
                <p className="mt-1.5 text-sm text-muted">Optional. Set a few budgets and a savings target. Skip anything you’re unsure about.</p>
              </div>
              <Field label="Monthly savings target" hint="How much you’d like to keep each month after spending.">
                <MoneyInput value={target} onChange={setTarget} currency={currency} />
              </Field>
              <div className="flex flex-col gap-3">
                <p className="text-[13px] font-medium text-ink">Monthly budgets</p>
                {BUDGET_CATEGORIES.map((id) => {
                  const c = data.categories.find((x) => x.id === id)!;
                  return (
                    <div key={id} className="flex items-center gap-3">
                      <CategoryIcon category={c} size={36} />
                      <label htmlFor={`b-${id}`} className="min-w-0 flex-1 truncate text-sm text-ink">{c.name}</label>
                      <div className="w-36">
                        <MoneyInput id={`b-${id}`} value={budgets[id] ?? ''} onChange={(v) => setBudgets((b) => ({ ...b, [id]: v }))} currency={currency} aria-label={`${c.name} monthly budget`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0} icon={<ArrowLeft size={16} />}>
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button variant="primary" onClick={next}>
                Continue <ArrowRight size={16} />
              </Button>
            ) : (
              <Button variant="primary" onClick={() => finish()}>
                Take me to my dashboard
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
