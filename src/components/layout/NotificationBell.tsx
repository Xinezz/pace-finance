import { AlertCircle, Bell, BellOff, CheckCircle2, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { generateNotices } from '../../domain/insights';
import { useStore } from '../../state/store';
import { useUi } from '../../state/ui';
import { Button } from '../ui/Button';
import { Popover } from '../ui/Popover';

/** Notification center: budget warnings, uncategorized reminders, goal nudges. Derived from data, never stored. */
export function NotificationBell() {
  const { data, dispatch, today } = useStore();
  const { navigate } = useUi();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const notices = useMemo(() => generateNotices(data, today), [data, today]);
  const hasDismissed = data.settings.dismissedNotifications.length > 0;

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={notices.length ? `Notifications, ${notices.length} new` : 'Notifications'}
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface text-muted transition-colors hover:bg-surface2 hover:text-ink"
      >
        <Bell size={17} />
        {notices.length > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-peach-deep px-1 text-[10px] font-bold text-white" style={{ height: '1.1rem', minWidth: '1.1rem' }}>
            {notices.length}
          </span>
        )}
      </button>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} label="Notifications" width={360} align="end">
        <div className="p-1">
          <div className="mb-1 flex items-center justify-between px-2 py-1">
            <h2 className="font-serif text-lg text-ink">Notifications</h2>
            {hasDismissed && (
              <button type="button" className="text-xs font-medium text-sage-deep hover:underline" onClick={() => dispatch({ type: 'resetNotices' })}>
                Show dismissed
              </button>
            )}
          </div>
          {notices.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-sage-soft text-sage-deep">
                <BellOff size={20} />
              </span>
              <p className="text-sm font-medium text-ink">All quiet</p>
              <p className="text-xs text-muted">Budget warnings and reminders will show up here when they matter.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {notices.map((n) => (
                <li key={n.id} className="group flex gap-3 rounded-xl p-2.5 hover:bg-surface2">
                  <span className={`mt-0.5 shrink-0 ${n.tone === 'attention' ? 'text-peach-deep' : n.tone === 'good' ? 'text-sage-deep' : 'text-blue-deep'}`}>
                    {n.tone === 'good' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug text-ink">{n.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{n.body}</p>
                    {n.link && (
                      <Button
                        size="sm"
                        variant="soft"
                        className="mt-2"
                        onClick={() => {
                          setOpen(false);
                          navigate(n.link!.to);
                        }}
                      >
                        {n.link.label}
                      </Button>
                    )}
                  </div>
                  <button type="button" aria-label={`Dismiss: ${n.title}`} className="h-6 w-6 shrink-0 rounded-md text-muted opacity-60 hover:bg-surface hover:text-ink hover:opacity-100" onClick={() => dispatch({ type: 'dismissNotice', id: n.id })}>
                    <X size={14} className="mx-auto" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Popover>
    </>
  );
}
