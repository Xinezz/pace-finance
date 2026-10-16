import { BarChart3, CalendarDays, FileText, LayoutDashboard, PiggyBank, Receipt, Settings, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Page } from '../../state/ui';

export interface NavItem {
  page: Page;
  label: string;
  icon: ReactNode;
}

export const NAV_ITEMS: NavItem[] = [
  { page: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={19} /> },
  { page: 'transactions', label: 'Transactions', icon: <Receipt size={19} /> },
  { page: 'analytics', label: 'Analytics', icon: <BarChart3 size={19} /> },
  { page: 'budgets', label: 'Budgets', icon: <Wallet size={19} /> },
  { page: 'savings', label: 'Savings', icon: <PiggyBank size={19} /> },
  { page: 'calendar', label: 'Calendar', icon: <CalendarDays size={19} /> },
  { page: 'reports', label: 'Reports', icon: <FileText size={19} /> },
  { page: 'settings', label: 'Settings', icon: <Settings size={19} /> },
];

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="19" fill="var(--c-ink)" />
      <path d="M20 44V20h13a9 9 0 0 1 0 18H20" fill="none" stroke="var(--c-butter)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="44" cy="44" r="4" fill="var(--c-sage)" />
    </svg>
  );
}

export function greeting(name: string, now: Date = new Date()): string {
  const h = now.getHours();
  const part = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const n = name.trim().split(/\s+/)[0];
  return n ? `${part}, ${n}` : part;
}
