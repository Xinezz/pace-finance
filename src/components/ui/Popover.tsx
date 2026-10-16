import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface PopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  align?: 'start' | 'end';
  label: string;
}

/**
 * A floating panel anchored to an element, rendered in a portal so tables and scroll containers
 * can't clip it. Flips above the anchor if there is no room below. Closes on Escape or outside click.
 * (Not for use inside a <dialog>: portals sit behind the top layer. Use inline panels there.)
 */
export function Popover({ anchorRef, open, onClose, children, width = 300, align = 'start', label }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      if (!a) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(width, vw - 16);
      let left = align === 'end' ? a.right - w : a.left;
      left = Math.max(8, Math.min(left, vw - w - 8));
      const spaceBelow = vh - a.bottom - 12;
      const spaceAbove = a.top - 12;
      const below = spaceBelow >= 280 || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(200, Math.min(420, below ? spaceBelow : spaceAbove));
      const panelH = panelRef.current?.offsetHeight ?? maxHeight;
      const top = below ? a.bottom + 6 : Math.max(8, a.top - 6 - Math.min(panelH, maxHeight));
      setPos({ top, left, maxHeight });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchorRef, width, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchorRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      className="fixed z-[90] overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-[var(--shadow-pop)] [animation:pop-in_0.16s_ease_both]"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: Math.min(width, window.innerWidth - 16), maxHeight: pos?.maxHeight ?? 420, visibility: pos ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  );
}
