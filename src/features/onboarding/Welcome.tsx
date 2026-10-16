import { LockKeyhole, PiggyBank, Tags } from 'lucide-react';
import { createDemoData } from '../../domain/demo';
import { useStore } from '../../state/store';
import { AccountStrip } from '../../components/account/AccountStrip';
import { Logo } from '../../components/layout/nav';
import { Button } from '../../components/ui/Button';

const POINTS = [
  { icon: <Tags size={18} />, title: 'You decide where things belong', text: 'Categorize in one tap, bulk edit, and teach Pace your habits. Nothing you choose is ever overridden.' },
  { icon: <PiggyBank size={18} />, title: 'Watch your savings grow', text: 'Set goals, track progress, and see exactly what you’ve got left after spending.' },
  { icon: <LockKeyhole size={18} />, title: 'Private by design', text: 'Everything stays in this browser. No bank logins, no accounts, no tracking.' },
];

export function Welcome() {
  const { dispatch } = useStore();

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-5 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-sage/30 blur-3xl" />
        <div className="absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-blue/30 blur-3xl" />
        <div className="absolute -bottom-24 left-1/4 h-80 w-80 rounded-full bg-peach/25 blur-3xl" />
        <div className="absolute bottom-10 right-10 h-40 w-40 rounded-full bg-butter/40 blur-2xl" />
      </div>

      <AccountStrip />
      <main className="stagger mx-auto flex w-full max-w-xl flex-col items-center text-center">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={44} />
          <span className="font-serif text-3xl text-ink">Pace</span>
        </div>
        <h1 className="font-serif text-5xl font-medium leading-[1.05] text-ink sm:text-6xl">
          Your money,
          <br />
          <em className="font-normal italic text-sage-deep">your pace.</em>
        </h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-muted">
          A calm place to see where your money goes, sort it your own way, and watch your savings grow.
        </p>

        <ul className="mt-9 flex w-full flex-col gap-3 text-left">
          {POINTS.map((p) => (
            <li key={p.title} className="flex items-start gap-4 rounded-2xl border border-line bg-surface/80 p-4 backdrop-blur">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sage-soft text-sage-deep">{p.icon}</span>
              <div>
                <p className="font-medium text-ink">{p.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{p.text}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-9 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <Button size="lg" variant="primary" onClick={() => dispatch({ type: 'replace', data: createDemoData() })} className="sm:min-w-56" data-autofocus>
            Explore with demo data
          </Button>
          <Button size="lg" variant="outline" onClick={() => dispatch({ type: 'startFresh' })} className="sm:min-w-44">
            Start fresh
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted">Demo data is clearly marked and can be cleared in one click.</p>
      </main>
    </div>
  );
}
