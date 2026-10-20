import { X } from 'lucide-react';
import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';

let openModals = 0;
let stopViewportSync: (() => void) | null = null;

/**
 * Keep --vv-top / --vv-height equal to the part of the screen that's actually visible. On phones the
 * on-screen keyboard covers the bottom of the page without resizing it (iOS), so dialogs size themselves
 * to these instead, and their fields and buttons stay above the keyboard.
 */
function startViewportSync() {
  const vv = window.visualViewport;
  const root = document.documentElement.style;
  const sync = () => {
    root.setProperty('--vv-top', `${vv ? vv.offsetTop : 0}px`);
    root.setProperty('--vv-height', `${vv ? vv.height : window.innerHeight}px`);
  };
  sync();
  vv?.addEventListener('resize', sync);
  vv?.addEventListener('scroll', sync);
  window.addEventListener('resize', sync);
  return () => {
    vv?.removeEventListener('resize', sync);
    vv?.removeEventListener('scroll', sync);
    window.removeEventListener('resize', sync);
    root.removeProperty('--vv-top');
    root.removeProperty('--vv-height');
  };
}

interface ModalProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons pinned below the scrolling content, so they stay in reach (and above a phone keyboard). */
  footer?: ReactNode;
  /** CSS width, e.g. "34rem". */
  width?: string;
  role?: 'dialog' | 'alertdialog';
  /** false hides the close button and ignores Escape/backdrop clicks: for dialogs that need a real choice. */
  dismissible?: boolean;
  /** On phones, take the whole visible screen instead of a sheet that grows from the bottom (long forms). */
  fullScreenOnPhone?: boolean;
}

/**
 * A modal built on the native <dialog> element, which provides focus trapping, Escape handling,
 * an inert page behind it, and focus restoration. The <dialog> itself is a transparent layer the size of
 * the visible screen; the panel inside is the box people see. On phones it becomes a bottom sheet (see CSS).
 */
export function Modal({ title, description, onClose, children, footer, width = '34rem', role = 'dialog', dismissible = true, fullScreenOnPhone = false }: ModalProps) {
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
    if (openModals === 1) stopViewportSync = startViewportSync();
    document.documentElement.style.overflow = 'hidden';
    return () => {
      openModals = Math.max(0, openModals - 1);
      if (openModals === 0) {
        document.documentElement.style.overflow = '';
        stopViewportSync?.();
        stopViewportSync = null;
      }
      d?.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      role={role}
      className="pace-dialog"
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
      <div className={`pace-dialog-panel ${fullScreenOnPhone ? 'pace-dialog-full' : ''}`} style={{ '--dialog-w': width } as CSSProperties}>
        <div className="flex shrink-0 items-start justify-between gap-4 px-6 pb-2 pt-5">
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
              className="-mr-2 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-surface2 hover:text-ink"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-3">{children}</div>
        {footer && <div className="pace-dialog-footer shrink-0 border-t border-line bg-surface px-6 py-3">{footer}</div>}
      </div>
    </dialog>
  );
}
