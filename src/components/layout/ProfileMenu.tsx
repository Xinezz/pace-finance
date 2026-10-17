import { Download, LogIn, LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react';
import { useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { useExportBackup } from '../../hooks/useBackup';
import { useStore } from '../../state/store';
import { useTheme } from '../../state/theme';
import { useUi } from '../../state/ui';
import type { ThemeSetting } from '../../domain/types';
import { Segmented } from '../ui/Form';
import { Popover } from '../ui/Popover';

export function ProfileMenu() {
  const { data } = useStore();
  const { theme, setTheme } = useTheme();
  const { navigate } = useUi();
  const auth = useAuth();
  const exportBackup = useExportBackup();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const name = data.settings.userName.trim();
  const initial = (name[0] ?? '🌿').toUpperCase();

  const item = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-surface2';

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Profile and settings menu"
        onClick={() => setOpen((o) => !o)}
        className="grid h-9 w-9 place-items-center rounded-full bg-sage-soft font-serif text-base font-medium text-sage-deep ring-1 ring-sage/50 transition-transform hover:scale-105"
      >
        {initial}
      </button>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} label="Profile menu" width={280} align="end">
        <div className="p-1">
          <div className="px-3 pb-3 pt-2">
            <p className="font-serif text-lg text-ink">{name || 'Welcome'}</p>
            <p className="truncate text-xs text-muted">
              {auth.status === 'signed-in' ? auth.user?.email : data.meta.mode === 'demo' ? 'Exploring demo data' : 'Your data stays on this device'}
            </p>
          </div>
          <div className="px-3 pb-3">
            <Segmented<ThemeSetting>
              ariaLabel="Colour theme"
              size="sm"
              className="w-full [&>button]:flex-1"
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'light', label: <span className="inline-flex items-center gap-1"><Sun size={12} /> Light</span> },
                { value: 'dark', label: <span className="inline-flex items-center gap-1"><Moon size={12} /> Dark</span> },
                { value: 'system', label: <span className="inline-flex items-center gap-1"><Monitor size={12} /> Auto</span> },
              ]}
            />
          </div>
          <button className={item} onClick={() => { setOpen(false); navigate('/settings'); }}>
            <Settings size={16} className="text-muted" /> Settings
          </button>
          <button className={item} onClick={() => { setOpen(false); exportBackup(); }}>
            <Download size={16} className="text-muted" /> Download a backup
          </button>
          {auth.status === 'signed-in' && (
            <button className={item} onClick={() => { setOpen(false); void auth.signOut(); }}>
              <LogOut size={16} className="text-muted" /> Sign out
            </button>
          )}
          {auth.status === 'guest' && (
            <button className={item} onClick={() => { setOpen(false); auth.leaveGuestMode(); }}>
              <LogIn size={16} className="text-muted" /> Sign in or create an account
            </button>
          )}
        </div>
      </Popover>
    </>
  );
}
