import { LogOut } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';

/**
 * A small "signed in as … · Sign out" pill for the full-screen steps (welcome, onboarding) that
 * don't have the normal app chrome, so people can always see whose account is open and leave it.
 */
export function AccountStrip() {
  const auth = useAuth();
  if (auth.status !== 'signed-in' || !auth.user) return null;
  return (
    <div className="no-print fixed right-3 top-3 z-20 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border border-line bg-surface/90 py-1 pl-3.5 pr-1 text-xs text-muted shadow-[var(--shadow-card)] backdrop-blur sm:right-5 sm:top-5">
      <span className="truncate" title={auth.user.email}>
        {auth.user.email}
      </span>
      <button
        type="button"
        onClick={() => void auth.signOut()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 font-medium text-ink transition-colors hover:bg-surface2"
      >
        <LogOut size={13} aria-hidden /> Sign out
      </button>
    </div>
  );
}
