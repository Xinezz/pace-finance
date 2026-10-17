import { AlertTriangle, ArrowLeft, Mail, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AccountStrip } from '../components/account/AccountStrip';
import { Logo } from '../components/layout/nav';
import { Button } from '../components/ui/Button';
import { Field, Segmented, TextInput } from '../components/ui/Form';
import { useAuth } from './AuthProvider';
import { PasswordInput, StrengthMeter } from './PasswordFields';
import { checkPassword, normalizeEmail, validateEmail } from './validate';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset-sent' | 'confirm';

/** After this many wrong tries in a row we pause for a moment. (The server enforces real limits too.) */
const MAX_FAILURES = 5;
const COOLDOWN_SECONDS = 30;

/** Jump into the first field only with a mouse or trackpad; on phones the keyboard would cover the screen. */
const finePointer = () => window.matchMedia('(pointer: fine)').matches;

function Backdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-16">
      <AccountStrip />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-sage/30 blur-3xl" />
        <div className="absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-blue/30 blur-3xl" />
        <div className="absolute -bottom-24 left-1/4 h-80 w-80 rounded-full bg-peach/25 blur-3xl" />
      </div>
      <main className="page-enter w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <Logo size={40} />
          <span className="font-serif text-3xl text-ink">Pace</span>
        </div>
        {children}
      </main>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-[1.5rem] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">{children}</div>;
}

/** Why an email link didn't work, for example. */
function Notice() {
  const { notice, dismissNotice } = useAuth();
  if (!notice) return null;
  return (
    <div role="alert" className="mb-4 flex items-start gap-3 rounded-2xl border border-peach/60 bg-peach-soft px-4 py-3 text-sm leading-relaxed text-peach-deep">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">{notice}</p>
      <button type="button" aria-label="Dismiss" onClick={dismissNotice} className="-m-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-peach/30">
        <X size={15} />
      </button>
    </div>
  );
}

function MockBanner() {
  const { cloud } = useAuth();
  if (cloud?.kind !== 'mock') return null;
  return (
    <p role="note" className="mb-4 rounded-2xl border border-butter/70 bg-butter-soft px-4 py-3 text-sm text-butter-deep">
      <strong className="font-semibold">Development mode.</strong> Accounts here are simulated in this browser and are <strong>not secure</strong>. Connect Supabase for real accounts.
    </p>
  );
}

export function AuthScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [lockedUntil]);
  const secondsLeft = Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  const go = (next: Mode) => {
    setMode(next);
    setErrors({});
    setPassword('');
    setConfirm('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next: typeof errors = {};
    const emailError = validateEmail(email);
    if (emailError) next.email = emailError;

    if (mode === 'signin') {
      if (!password) next.password = 'Enter your password.';
      if (secondsLeft > 0) next.form = `Too many tries. You can try again in ${secondsLeft}s.`;
    } else if (mode === 'signup') {
      const check = checkPassword(password, email);
      if (!check.ok) next.password = check.issues[0];
      if (confirm !== password) next.confirm = 'The two passwords don’t match.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      if (mode === 'signin') {
        const res = await auth.signIn(email, password);
        if (!res.ok) {
          const count = failures + 1;
          setFailures(count);
          if (count >= MAX_FAILURES) {
            setLockedUntil(Date.now() + COOLDOWN_SECONDS * 1000);
            setNow(Date.now());
            setFailures(0);
          }
          setErrors({ form: res.error ?? 'We couldn’t sign you in.' });
        }
      } else if (mode === 'signup') {
        const res = await auth.signUp(email, password);
        if (!res.ok) setErrors({ form: res.error ?? 'We couldn’t create that account.' });
        else if (res.needsEmailConfirmation) go('confirm');
      } else if (mode === 'forgot') {
        const res = await auth.requestPasswordReset(email);
        if (!res.ok) setErrors({ form: res.error ?? 'We couldn’t send that email. Please try again.' });
        else go('reset-sent');
      }
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'confirm' || mode === 'reset-sent') {
    const confirming = mode === 'confirm';
    return (
      <Backdrop>
        <Card>
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-sage-soft text-sage-deep">
              <Mail size={24} aria-hidden />
            </span>
            <h1 className="font-serif text-3xl text-ink">Check your inbox</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted" role="status">
              {confirming ? (
                <>If <strong className="text-body">{normalizeEmail(email)}</strong> can be used for a new account, we’ve sent a link to confirm it. Click it, then come back here and sign in.</>
              ) : (
                <>If an account exists for <strong className="text-body">{normalizeEmail(email)}</strong>, a link to choose a new password is on its way. It can take a minute.</>
              )}
            </p>
            <Button variant="primary" className="mt-6" onClick={() => go('signin')} data-autofocus>
              Back to sign in
            </Button>
          </div>
        </Card>
      </Backdrop>
    );
  }

  const signup = mode === 'signup';
  const forgot = mode === 'forgot';

  return (
    <Backdrop>
      <MockBanner />
      <Notice />
      <Card>
        {!forgot && (
          <Segmented<'signin' | 'signup'>
            ariaLabel="Sign in or create an account"
            value={signup ? 'signup' : 'signin'}
            onChange={(v) => go(v)}
            className="mb-6 w-full [&>button]:flex-1"
            options={[
              { value: 'signin', label: 'Sign in' },
              { value: 'signup', label: 'Create account' },
            ]}
          />
        )}

        <h1 className="font-serif text-3xl text-ink">{forgot ? 'Reset your password' : signup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {forgot ? 'Enter your email and we’ll send you a link to choose a new password.' : signup ? 'Your finances, saved to your own private account and available on any device.' : 'Sign in to see your money.'}
        </p>

        <form key={mode} onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4">
          {errors.form && (
            <p role="alert" className="rounded-xl bg-peach-soft px-3 py-2.5 text-sm font-medium text-peach-deep">
              {errors.form}
            </p>
          )}
          <Field label="Email" required error={errors.email}>
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" autoFocus={finePointer()} />
          </Field>

          {!forgot && (
            <Field label="Password" required error={errors.password}>
              <PasswordInput value={password} onChange={setPassword} autoComplete={signup ? 'new-password' : 'current-password'} />
            </Field>
          )}
          {signup && (
            <>
              <StrengthMeter password={password} email={email} />
              <Field label="Confirm password" required error={errors.confirm}>
                <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
              </Field>
            </>
          )}

          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={secondsLeft > 0 && mode === 'signin'} className="mt-1">
            {forgot ? 'Send reset link' : signup ? 'Create account' : secondsLeft > 0 ? `Try again in ${secondsLeft}s` : 'Sign in'}
          </Button>

          {mode === 'signin' && (
            <button type="button" onClick={() => go('forgot')} className="tap self-center text-sm font-medium text-sage-deep hover:underline">
              Forgot your password?
            </button>
          )}
          {forgot && (
            <button type="button" onClick={() => go('signin')} className="tap inline-flex items-center gap-1.5 self-center text-sm font-medium text-sage-deep hover:underline">
              <ArrowLeft size={14} aria-hidden /> Back to sign in
            </button>
          )}
        </form>

        {signup && (
          <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted">
            <ShieldCheck size={15} className="mt-px shrink-0 text-sage-deep" aria-hidden />
            <span>Only you can read your data. Passwords are never stored in readable form, and you can delete your account and everything in it at any time.</span>
          </p>
        )}
      </Card>

      {!forgot && (
        <p className="mt-5 text-center text-sm text-muted">
          Just looking around?{' '}
          <button type="button" onClick={auth.continueAsGuest} className="tap font-medium text-sage-deep underline-offset-2 hover:underline">
            Continue without an account
          </button>
          <span className="mt-1 block text-xs">Your data then stays only in this browser: no sign-in, no sync.</span>
        </p>
      )}
    </Backdrop>
  );
}

/** Shown after someone follows the link in a password-reset email. */
export function RecoveryScreen() {
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next: typeof errors = {};
    const check = checkPassword(password, auth.user?.email);
    if (!check.ok) next.password = check.issues[0];
    if (confirm !== password) next.confirm = 'The two passwords don’t match.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      const res = await auth.updatePassword(password);
      if (!res.ok) setErrors({ form: res.error ?? 'We couldn’t change the password.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Backdrop>
      <MockBanner />
      <Card>
        <h1 className="font-serif text-3xl text-ink">Choose a new password</h1>
        <p className="mt-1.5 text-sm text-muted">for {auth.user?.email}</p>
        <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4">
          {errors.form && (
            <p role="alert" className="rounded-xl bg-peach-soft px-3 py-2.5 text-sm font-medium text-peach-deep">
              {errors.form}
            </p>
          )}
          <Field label="New password" required error={errors.password}>
            <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" autoFocus={finePointer()} />
          </Field>
          <StrengthMeter password={password} email={auth.user?.email} />
          <Field label="Confirm new password" required error={errors.confirm}>
            <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={busy}>
            Save and continue
          </Button>
          <button type="button" onClick={() => void auth.signOut()} className="tap self-center text-sm text-muted hover:text-ink hover:underline">
            Cancel and sign out
          </button>
        </form>
      </Card>
    </Backdrop>
  );
}
