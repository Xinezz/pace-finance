/** Toasts (success / error / info, optionally with an action such as Undo) and promise-based confirmations. */
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';

export type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  actions: { label: string; onClick: () => void }[];
  duration: number;
}

export interface ToastOptions {
  kind?: ToastKind;
  /** Buttons shown on the toast, e.g. Undo. */
  actions?: { label: string; onClick: () => void }[];
  /** ms; 0 keeps it until dismissed. */
  duration?: number;
}

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use "danger" for destructive actions. */
  tone?: 'default' | 'danger';
}

interface FeedbackApi {
  toast: (message: string, opts?: ToastOptions) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

const ICONS = {
  success: <CheckCircle2 size={18} className="text-sage-deep" aria-hidden />,
  error: <XCircle size={18} className="text-peach-deep" aria-hidden />,
  info: <Info size={18} className="text-blue-deep" aria-hidden />,
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (message: string, opts: ToastOptions = {}) => {
      const id = ++idRef.current;
      const kind = opts.kind ?? 'success';
      const actions = opts.actions ?? [];
      const duration = opts.duration ?? (actions.length ? 9000 : kind === 'error' ? 7000 : 3800);
      setToasts((t) => [...t.slice(-3), { id, kind, message, actions, duration }]);
      if (duration > 0) window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })),
    [],
  );

  const settle = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  const api = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <div
        className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 lg:bottom-6"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-body shadow-[var(--shadow-pop)] [animation:pop-in_0.25s_ease_both]"
          >
            {ICONS[t.kind]}
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.actions.map((a) => (
              <button
                key={a.label}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-sage-deep underline-offset-2 hover:underline"
                onClick={() => {
                  a.onClick();
                  dismiss(t.id);
                }}
              >
                {a.label}
              </button>
            ))}
            <button aria-label="Dismiss" className="rounded-md p-1 text-muted hover:text-ink" onClick={() => dismiss(t.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {confirmState && (
        <Modal title={confirmState.title} onClose={() => settle(false)} width="26rem" role="alertdialog">
          <div className="flex gap-3">
            {confirmState.tone === 'danger' && (
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-peach-soft text-peach-deep">
                <AlertTriangle size={18} aria-hidden />
              </span>
            )}
            <div className="text-sm leading-relaxed text-body">{confirmState.message}</div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => settle(false)}>
              {confirmState.cancelLabel ?? 'Cancel'}
            </Button>
            <Button variant={confirmState.tone === 'danger' ? 'danger' : 'primary'} onClick={() => settle(true)} data-autofocus>
              {confirmState.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        </Modal>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside <FeedbackProvider>');
  return ctx;
}
