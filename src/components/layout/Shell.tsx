import { AlertTriangle, CheckCircle2, CloudOff, Loader2, MoreHorizontal, Plus, Sprout, X } from 'lucide-react';
import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { needsCategory } from '../../domain/categorize';
import { useFeedback } from '../../state/feedback';
import { useStore } from '../../state/store';
import { useUi, type Page } from '../../state/ui';
import { CategorizeFlow } from '../transactions/CategorizeFlow';
import { TransactionModal } from '../transactions/TransactionModal';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Feedback';
import { Popover } from '../ui/Popover';
import { MonthSelector } from './MonthSelector';
import { NotificationBell } from './NotificationBell';
import { ProfileMenu } from './ProfileMenu';
import { Logo, NAV_ITEMS } from './nav';

const pages: Record<Page, LazyExoticComponent<ComponentType>> = {
  dashboard: lazy(() => import('../../features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage }))),
  transactions: lazy(() => import('../../features/transactions/TransactionsPage').then((m) => ({ default: m.TransactionsPage }))),
  analytics: lazy(() => import('../../features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage }))),
  budgets: lazy(() => import('../../features/budgets/BudgetsPage').then((m) => ({ default: m.BudgetsPage }))),
  savings: lazy(() => import('../../features/savings/SavingsPage').then((m) => ({ default: m.SavingsPage }))),
  calendar: lazy(() => import('../../features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage }))),
  reports: lazy(() => import('../../features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage }))),
  settings: lazy(() => import('../../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage }))),
};

function SaveIndicator() {
  const { saveState, storeKind } = useStore();
  if (storeKind === 'memory') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-peach-deep" role="status">
        <CloudOff size={13} /> Not saved
      </span>
    );
  }
  if (saveState === 'conflict') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-peach-deep" role="alert">
        <AlertTriangle size={13} /> Changed elsewhere
      </span>
    );
  }
  if (saveState === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted" role="status">
        <Loader2 size={13} className="animate-spin" /> {storeKind === 'cloud' ? 'Syncing…' : 'Saving…'}
      </span>
    );
  }
  if (saveState === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-peach-deep" role="alert">
        <AlertTriangle size={13} /> {storeKind === 'cloud' ? 'Couldn’t sync. Retrying…' : 'Couldn’t save'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" role="status">
      <CheckCircle2 size={13} className="text-sage-deep" /> {storeKind === 'cloud' ? 'Synced to your account' : 'Saved on this device'}
    </span>
  );
}

function Sidebar() {
  const { route, navigate } = useUi();
  const { data } = useStore();
  const needs = useMemo(() => data.transactions.filter(needsCategory).length, [data.transactions]);
  return (
    <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface/60 px-4 py-6 lg:flex">
      <button className="mb-8 flex items-center gap-3 rounded-xl px-2 text-left" onClick={() => navigate('/dashboard')} aria-label="Pace, go to dashboard">
        <Logo />
        <span>
          <span className="block font-serif text-2xl font-medium leading-none text-ink">Pace</span>
          <span className="mt-1 block text-[11px] text-muted">your money, your pace</span>
        </span>
      </button>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((n) => {
          const active = route.page === n.page;
          return (
            <a
              key={n.page}
              href={`#/${n.page}`}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${active ? 'bg-sage-soft text-ink shadow-[inset_3px_0_0_var(--c-sage-deep)]' : 'text-muted hover:bg-surface2 hover:text-ink'}`}
            >
              <span className={active ? 'text-sage-deep' : ''}>{n.icon}</span>
              {n.label}
              {n.page === 'transactions' && needs > 0 && (
                <span className="ml-auto rounded-full bg-peach-soft px-2 py-0.5 text-[11px] font-semibold text-peach-deep" title={`${needs} need a category`}>
                  {needs}
                </span>
              )}
            </a>
          );
        })}
      </nav>
      <div className="mt-4 rounded-2xl bg-surface2 p-3">
        <SaveIndicator />
        {data.meta.mode === 'demo' && <p className="mt-1.5 text-[11px] leading-snug text-muted">Showing demo data. Nothing here is real.</p>}
      </div>
    </aside>
  );
}

function MobileNav() {
  const { route, openAddTx } = useUi();
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const primary = NAV_ITEMS.filter((n) => ['dashboard', 'transactions', 'analytics'].includes(n.page));
  const rest = NAV_ITEMS.filter((n) => !['dashboard', 'transactions', 'analytics'].includes(n.page));
  const moreActive = rest.some((n) => n.page === route.page);

  const tab = (active: boolean) =>
    `flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition-colors ${active ? 'text-sage-deep' : 'text-muted'}`;

  const link = (n: (typeof NAV_ITEMS)[number]) => (
    <a key={n.page} href={`#/${n.page}`} aria-current={route.page === n.page ? 'page' : undefined} className={tab(route.page === n.page)}>
      <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${route.page === n.page ? 'bg-sage-soft' : ''}`}>{n.icon}</span>
      {n.label}
    </a>
  );

  return (
    <nav aria-label="Main" className="mobile-nav no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[max(0.35rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-1.5 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-lg items-end">
        {primary.slice(0, 2).map(link)}
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            aria-label="Add transaction"
            onClick={() => openAddTx()}
            className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-primary text-on-primary shadow-[var(--shadow-pop)] transition-transform active:scale-95"
          >
            <Plus size={26} />
          </button>
        </div>
        {primary.slice(2).map(link)}
        <button ref={moreRef} type="button" aria-haspopup="dialog" aria-expanded={more} onClick={() => setMore((m) => !m)} className={tab(moreActive || more)}>
          <span className={`grid h-7 w-12 place-items-center rounded-full ${moreActive ? 'bg-sage-soft' : ''}`}>
            <MoreHorizontal size={19} />
          </span>
          More
        </button>
      </div>
      <Popover anchorRef={moreRef} open={more} onClose={() => setMore(false)} label="More pages" width={240} align="end">
        <ul className="p-1">
          {rest.map((n) => (
            <li key={n.page}>
              <a href={`#/${n.page}`} onClick={() => setMore(false)} aria-current={route.page === n.page ? 'page' : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${route.page === n.page ? 'bg-sage-soft text-ink' : 'text-body hover:bg-surface2'}`}>
                <span className="text-sage-deep">{n.icon}</span>
                {n.label}
              </a>
            </li>
          ))}
        </ul>
      </Popover>
    </nav>
  );
}

function DemoBanner() {
  const { data, dispatch } = useStore();
  const { confirm, toast } = useFeedback();
  const { navigate } = useUi();
  const [hidden, setHidden] = useState(false);
  if (data.meta.mode !== 'demo' || hidden) return null;

  const startFresh = async () => {
    const ok = await confirm({
      title: 'Clear the demo data?',
      tone: 'danger',
      confirmLabel: 'Clear demo & start fresh',
      message: (
        <>
          <p>This removes the sample transactions, goals, budgets and balances so you can begin with your own numbers.</p>
          <p className="mt-2 text-muted">Anything you added yourself while exploring is kept, and so are categories you created.</p>
        </>
      ),
    });
    if (!ok) return;
    dispatch({ type: 'clearDemo' });
    navigate('/dashboard');
    toast('Demo data cleared. Fresh start!');
  };

  return (
    <div className="no-print mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-butter/70 bg-butter-soft px-4 py-3 text-sm text-butter-deep">
      <Sprout size={18} className="shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 basis-[14rem]">
        <strong className="font-semibold">You’re exploring demo data.</strong> These are made-up transactions so you can try every feature.
      </p>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="primary" onClick={startFresh}>
          Start with my own data
        </Button>
        <button type="button" aria-label="Hide this banner" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-butter/40" onClick={() => setHidden(true)}>
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

function TopBar() {
  const { openAddTx, route } = useUi();
  const { data } = useStore();
  const showMonth = ['dashboard', 'transactions', 'analytics', 'budgets', 'calendar', 'savings', 'reports'].includes(route.page);
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line/70 bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="page-x mx-auto flex h-16 max-w-6xl items-center gap-3">
        <div className="flex items-center gap-2 lg:hidden">
          <Logo size={30} />
        </div>
        <div className="min-w-0 flex-1">{showMonth && <MonthSelector />}</div>
        <div className="flex items-center gap-2">
          <span className="hidden md:block">
            <SaveIndicator />
          </span>
          {data.meta.mode === 'demo' && <span className="hidden rounded-full bg-butter-soft px-2.5 py-1 text-[11px] font-semibold text-butter-deep sm:inline">Demo</span>}
          <NotificationBell />
          <span className="hidden sm:block">
            <Button variant="primary" onClick={() => openAddTx()} icon={<Plus size={17} />} aria-keyshortcuts="N">
              Add transaction
            </Button>
          </span>
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}

function PageFallback() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading page">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function Shell(): ReactNode {
  const { route, txModal, categorizeIds, closeTxModal, closeCategorize } = useUi();
  const Page = pages[route.page];
  const { storeNotice } = useStore();
  const { openAddTx } = useUi();

  // Press N anywhere (outside a text field or open dialog) to add a transaction.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      openAddTx();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openAddTx]);

  return (
    <div className="flex min-h-dvh">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }} className="sr-only z-[200] rounded-xl bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <Sidebar />
      <div className="min-w-0 flex-1">
        <TopBar />
        <main id="main" tabIndex={-1} className="print-full page-x mx-auto max-w-6xl pb-[calc(8rem+env(safe-area-inset-bottom))] pt-6 outline-none lg:pb-16">
          {storeNotice && (
            <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-peach/60 bg-peach-soft px-4 py-3 text-sm text-peach-deep">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              {storeNotice}
            </div>
          )}
          <DemoBanner />
          <Suspense fallback={<PageFallback />}>
            <div key={route.page} className="page-enter">
              <Page />
            </div>
          </Suspense>
        </main>
      </div>
      <MobileNav />
      {txModal && <TransactionModal key={`${txModal.mode}-${txModal.id ?? 'new'}`} state={txModal} onClose={closeTxModal} />}
      {categorizeIds && <CategorizeFlow ids={categorizeIds === 'all-needing' ? undefined : categorizeIds} onClose={closeCategorize} />}
    </div>
  );
}
