import { CloudDownload, HardDriveDownload } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../../state/store';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

/**
 * Two moments that need the person to decide, shown on top of everything else:
 *  1. The account's saved copy changed on another device (never overwritten silently).
 *  2. A brand-new account is empty but this device holds data from before signing in.
 */
export function AccountDialogs() {
  const { conflict, localCopy } = useStore();
  return (
    <>
      {conflict && <ConflictDialog />}
      {!conflict && localCopy && <LocalCopyDialog />}
    </>
  );
}

function ConflictDialog() {
  const { resolveConflict } = useStore();
  const [busy, setBusy] = useState<'reload' | 'overwrite' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (choice: 'reload' | 'overwrite') => {
    setBusy(choice);
    setError(null);
    try {
      await resolveConflict(choice);
    } catch {
      setError('We couldn’t reach your account. Check your connection and try again.');
      setBusy(null);
    }
  };

  return (
    // Not dismissible on purpose: this needs an actual choice.
    <Modal title="Changed on another device" onClose={() => undefined} dismissible={false} width="30rem" role="alertdialog">
      <p className="text-sm leading-relaxed text-body">
        Your account was updated from another device or tab since you opened it here. To avoid losing anything, nothing has been saved from this screen yet.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void choose('reload')}
          className="flex items-start gap-3 rounded-2xl border border-line p-4 text-left transition-colors hover:bg-surface2 disabled:opacity-60"
          data-autofocus
        >
          <CloudDownload size={20} className="mt-0.5 shrink-0 text-sage-deep" aria-hidden />
          <span>
            <span className="block font-medium text-ink">Load the latest version</span>
            <span className="block text-sm text-muted">Recommended. You’ll see what was saved elsewhere. Changes you made on this screen since opening it are discarded.</span>
          </span>
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void choose('overwrite')}
          className="flex items-start gap-3 rounded-2xl border border-line p-4 text-left transition-colors hover:bg-surface2 disabled:opacity-60"
        >
          <HardDriveDownload size={20} className="mt-0.5 shrink-0 text-peach-deep" aria-hidden />
          <span>
            <span className="block font-medium text-ink">Keep what’s on this screen</span>
            <span className="block text-sm text-muted">Replaces the version saved from the other device. Use this only if you’re sure this screen is the right one.</span>
          </span>
        </button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-peach-deep">{error}</p>}
    </Modal>
  );
}

function LocalCopyDialog() {
  const { localCopy, adoptLocalCopy, dismissLocalCopy } = useStore();
  if (!localCopy) return null;
  const tx = localCopy.transactions.length;
  const goals = localCopy.goals.length;
  const isDemo = localCopy.meta.mode === 'demo';
  return (
    <Modal title="Bring your data into this account?" onClose={dismissLocalCopy} width="30rem">
      <p className="text-sm leading-relaxed text-body">
        We found {isDemo ? 'demo data' : 'data'} on this device from before you signed in: {tx} transaction{tx === 1 ? '' : 's'} and {goals} goal{goals === 1 ? '' : 's'}. You can move it into your new account so it’s saved to the cloud and available on all your devices.
      </p>
      <p className="mt-2 text-sm text-muted">A copy stays on this device until you erase it in Settings → Account.</p>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={dismissLocalCopy}>
          Start fresh instead
        </Button>
        <Button variant="primary" onClick={adoptLocalCopy} data-autofocus>
          Move it into my account
        </Button>
      </div>
    </Modal>
  );
}
