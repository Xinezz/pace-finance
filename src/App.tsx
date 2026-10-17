import { useEffect, useMemo, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { AuthScreen, RecoveryScreen } from './auth/AuthScreen';
import { AccountDialogs } from './components/account/AccountDialogs';
import { CloudDataStore } from './cloud/cloudStore';
import { Confetti } from './components/ui/Feedback';
import { Button } from './components/ui/Button';
import { Shell } from './components/layout/Shell';
import { Logo } from './components/layout/nav';
import { Onboarding } from './features/onboarding/Onboarding';
import { Welcome } from './features/onboarding/Welcome';
import { FeedbackProvider } from './state/feedback';
import { StoreProvider, useStore, type StoreLoader } from './state/store';
import { UiProvider, useUi } from './state/ui';

const MILESTONE_COPY: Record<number, { title: string; text: string }> = {
  25: { title: 'A quarter of the way', text: 'is 25% funded. A lovely start.' },
  50: { title: 'Halfway there!', text: 'is 50% funded. Keep going at your pace.' },
  75: { title: 'Almost there', text: 'is 75% funded. The finish line is in sight.' },
  100: { title: 'Goal reached!', text: 'is fully funded. You did it.' },
};

function CelebrationOverlay() {
  const { celebration, clearCelebration } = useStore();
  useEffect(() => {
    if (!celebration) return;
    const t = window.setTimeout(clearCelebration, 6000);
    return () => window.clearTimeout(t);
  }, [celebration, clearCelebration]);
  if (!celebration) return null;
  const copy = MILESTONE_COPY[celebration.milestone] ?? MILESTONE_COPY[100];
  return (
    <>
      <Confetti key={celebration.id} onDone={() => undefined} />
      <div role="status" className="fixed inset-x-0 top-20 z-[130] flex justify-center px-4 [animation:pop-in_0.4s_ease_both]">
        <div className="flex max-w-sm items-center gap-4 rounded-3xl border border-butter bg-surface px-5 py-4 shadow-[var(--shadow-pop)]">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-butter-soft text-2xl" aria-hidden>
            {celebration.icon}
          </span>
          <div className="min-w-0">
            <p className="font-serif text-lg text-ink">{copy.title}</p>
            <p className="text-sm text-muted">
              <strong className="font-semibold text-body">{celebration.goalName}</strong> {copy.text}
            </p>
          </div>
          <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-sage-deep hover:underline" onClick={clearCelebration}>
            Close
          </button>
        </div>
      </div>
    </>
  );
}

function Splash({ children }: { children?: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="animate-pulse">
          <Logo size={52} />
        </div>
        {children}
      </div>
    </div>
  );
}

function Gate() {
  const { ready, loadError, data } = useStore();
  const { route } = useUi();

  const auth = useAuth();

  if (loadError) {
    const signedIn = auth.status === 'signed-in';
    return (
      <Splash>
        <h1 className="font-serif text-2xl text-ink">We couldn’t open your saved data</h1>
        <p className="max-w-sm text-sm text-muted">
          {signedIn ? 'We couldn’t reach your account. Check your connection, or sign out and back in if your session has expired.' : `${loadError} Your browser may be blocking local storage for this page.`}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={() => window.location.reload()}>
            Try again
          </Button>
          {signedIn && (
            <Button onClick={() => void auth.signOut()}>
              Sign out
            </Button>
          )}
        </div>
      </Splash>
    );
  }
  if (!ready) {
    return (
      <Splash>
        <p className="text-sm text-muted" role="status">Opening your finances…</p>
      </Splash>
    );
  }
  if (data.meta.mode === 'new') return <Welcome />;
  if (!data.meta.onboarded) return <Onboarding />;
  // `route` is read so the shell re-renders on navigation.
  void route;
  return <Shell />;
}

/** Everything that needs the person's data. Rebuilt from scratch (see `key`) whenever the account changes. */
function Workspace() {
  const auth = useAuth();
  const { cloud } = auth;
  const cloudUser = auth.status === 'signed-in' ? auth.user : null;
  const userId = cloudUser?.id;

  // A signed-in person's data lives in their cloud account; a guest's (or an unconfigured build's) stays on this device.
  const loader = useMemo<StoreLoader | undefined>(
    () => (cloud && cloudUser ? async () => ({ store: new CloudDataStore(cloud.gatewayFor(cloudUser)) }) : undefined),
    // cloudUser is intentionally keyed by id: a refreshed token must not rebuild the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cloud, userId],
  );

  return (
    <StoreProvider loader={loader} offerLocalImport={!!cloudUser}>
      <FeedbackProvider>
        <UiProvider>
          <Gate />
          {/* On every screen, including welcome and onboarding, where a new account first lands. */}
          <AccountDialogs />
          <CelebrationOverlay />
        </UiProvider>
      </FeedbackProvider>
    </StoreProvider>
  );
}

function AuthGate() {
  const auth = useAuth();
  if (auth.status === 'loading') {
    return (
      <Splash>
        <p className="text-sm text-muted" role="status">Opening your finances…</p>
      </Splash>
    );
  }
  if (auth.status === 'signed-out') return <AuthScreen />;
  if (auth.status === 'recovery') return <RecoveryScreen />;
  return <Workspace key={auth.scope} />;
}

export function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
