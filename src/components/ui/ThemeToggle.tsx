import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../state/theme';

/** One tap between light and dark. (Settings also offers "Match device".) */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { dark, toggle } = useTheme();
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface2 hover:text-ink ${className}`}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
