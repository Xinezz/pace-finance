/**
 * Light / dark appearance. It's a per-device choice (a phone dark at night, a laptop light), so it lives in
 * this browser rather than in the synced data, and it works on the sign-in screens too.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ThemeSetting } from '../domain/types';

/** Also read by the inline script in index.html, which applies the theme before the first paint. */
const KEY = 'pace:theme';
const BAR_COLOR = { light: '#F8F6F0', dark: '#151a16' };

function readSetting(): ThemeSetting {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'dark' || t === 'system' ? t : 'light';
  } catch {
    return 'light';
  }
}

const deviceDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

interface ThemeApi {
  /** What was chosen: light, dark, or follow the device. */
  theme: ThemeSetting;
  /** What is showing right now. */
  dark: boolean;
  setTheme: (theme: ThemeSetting) => void;
  /** Switch to the opposite of what is showing. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeSetting>(readSetting);
  const [systemDark, setSystemDark] = useState(deviceDark);
  const dark = theme === 'dark' || (theme === 'system' && systemDark);

  // Follow the device's own setting, and choices made in another tab.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onDevice = () => setSystemDark(mq.matches);
    const onStorage = (e: StorageEvent) => e.key === KEY && setThemeState(readSetting());
    mq.addEventListener('change', onDevice);
    window.addEventListener('storage', onStorage);
    return () => {
      mq.removeEventListener('change', onDevice);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    // The phone's status bar / browser toolbar colour.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? BAR_COLOR.dark : BAR_COLOR.light);
  }, [dark]);

  const setTheme = useCallback((next: ThemeSetting) => {
    setThemeState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage may be blocked; the theme still applies for this visit */
    }
  }, []);

  const toggle = useCallback(() => setTheme(dark ? 'light' : 'dark'), [dark, setTheme]);

  const value = useMemo(() => ({ theme, dark, setTheme, toggle }), [theme, dark, setTheme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
