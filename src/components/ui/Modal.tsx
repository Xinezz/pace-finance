import { X } from 'lucide-react';
import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';

let openModals = 0;

interface ModalProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  /** CSS width, e.g. "34rem". */
  width?: string;
  role?: 'dialog' | 'alertdialog';
  /** false hides the close button and ignores Escape/backdrop clicks: for dialogs that need a real choice. */
  dismissible?: boolean;
}

/**
 * A modal built on the native <dialog> element, which provides focus trapping, Escape handling,
 * an inert page behind it, and focus restoration. On phones it becomes a bottom sheet (see CSS).
 */
export function Modal({ title, description, onClose, children, width = '34rem', role = 'dialog', dismissible = true }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // Focus the first field marked data-autofocus (skipped on touch devices so the keyboard doesn't cover the form).
    const target = d?.querySelector<HTMLElement>('[data-autofocus]');
    if (target && window.matchMedia('(pointer: fine)').matches) target.focus();
    openModals += 1;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      openModals = Math.max(0, openModals - 1);
      if (openModals === 0) document.documentElement.style.overflow = '';
      d?.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      role={role}
      className="pace-dialog"
      style={{ '--dialog-w': width } as CSSProperties}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current && downOnBackdrop.current) onClose();
      }}
    >
      <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
        <div className="min-w-0">
          <h2 id={titleId} className="font-serif text-2xl font-medium leading-tight text-ink">
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-1 text-sm text-muted">
              {description}
            </p>
          )}
        </div>
        {dismissible && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-surface2 hover:text-ink"
          >
            <X size={18} />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-3">{children}</div>
    </dialog>
  );
}
