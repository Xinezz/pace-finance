import { LogOut } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { ThemeToggle } from '../ui/ThemeToggle';

/**
 * The top corner of the full-screen steps (sign-in, welcome, onboarding) that don't have the normal app
 * chrome: a light/dark switch, and a "signed in as … · Sign out" pill so people can always see whose
 * account is open and leave it.
 */
export function AccountStrip() {
  const auth = useAuth();
  const user = auth.status === 'signed-in' ? auth.user : null;
  return (
    <div className="no-print fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 sm:right-5 sm:top-5">
      {user && (
        <div className="flex min-w-0 items-center gap-2 rounded-full border border-line bg-surface/90 py-1 pl-3.5 pr-1 text-xs text-muted shadow-[var(--shadow-card)] backdrop-blur">
          <span className="truncate" title={user.email}>
            {user.email}
          </span>
          <button
            type="button"
            onClick={() => void auth.signOut()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 font-medium text-ink transition-colors hover:bg-surface2"
          >
            <LogOut size={13} aria-hidden /> Sign out
          </button>
        </div>
      )}
      <ThemeToggle className="border border-line bg-surface/90 shadow-[var(--shadow-card)] backdrop-blur" />
    </div>
  );
}
