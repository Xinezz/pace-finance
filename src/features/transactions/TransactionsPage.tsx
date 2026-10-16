import { ArrowDownUp, ChevronLeft, ChevronRight, Download, Filter, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CategoryAssignButton } from '../../components/category/CategoryAssignButton';
import { ImportWizard } from '../../components/import/ImportWizard';
import { NeedsAttention } from '../../components/transactions/NeedsAttention';
import { TransactionRow } from '../../components/transactions/TransactionRow';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, PageHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/Feedback';
import { Select, TextInput, inputClass } from '../../components/ui/Form';
import { categoryById, distinctTags, summarize } from '../../domain/calc';
import { formatMonthLabel, monthRange, yearOf } from '../../domain/dates';
import { EMPTY_FILTER, filterTransactions, isFilterActive, sortTransactions, type SortDir, type SortKey, type TxFilter } from '../../domain/filter';
import { transactionsToCsv } from '../../domain/importer';
import { useCategorize } from '../../hooks/useCategorize';
import { downloadText } from '../../lib/download';
import { useFeedback } from '../../state/feedback';
import { useMoney, useStore } from '../../state/store';
import { useUi } from '../../state/ui';

type Period = 'month' | 'year' | 'all' | 'custom';
const PAGE_SIZES = [25, 50, 100];

export function TransactionsPage() {
  const { data, dispatch, undo } = useStore();
  const { fmt } = useMoney();
  const { toast, confirm } = useFeedback();
  const { month, route, openAddTx, setMonth } = useUi();
  const { categorize } = useCategorize();
  const params = route.params;

  const [filter, setFilter] = useState<TxFilter>(() => ({
    ...EMPTY_FILTER,
    categoryId: params.get('needs') ? 'uncategorized' : (params.get('category') ?? 'all'),
    type: (params.get('type') as TxFilter['type']) ?? 'all',
    tag: params.get('tag') ?? 'all',
    q: params.get('q') ?? '',
  }));
  const [period, setPeriod] = useState<Period>(() => (params.get('period') as Period) ?? (params.get('needs') ? 'all' : 'month'));
  const [year, setYear] = useState(() => Number(month.slice(0, 4)));
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [importing, setImporting] = useState(false);

  // Honour links such as /transactions?category=food&month=2026-10
  useEffect(() => {
    const m = params.get('month');
    if (m && /^\d{4}-\d{2}$/.test(m)) setMonth(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const range = useMemo(() => {
    if (period === 'month') return monthRange(month);
    if (period === 'year') return { from: `${year}-01-01`, to: `${year}-12-31` };
    if (period === 'custom') return { from: custom.from || undefined, to: custom.to || undefined };
    return { from: undefined, to: undefined };
  }, [period, month, year, custom]);

  const effective: TxFilter = useMemo(() => ({ ...filter, from: range.from, to: range.to }), [filter, range]);
  const catMap = useMemo(() => categoryById(data.categories), [data.categories]);
  const years = useMemo(() => {
    const ys = new Set(data.transactions.map((t) => yearOf(t.date)));
    ys.add(Number(month.slice(0, 4)));
    return [...ys].sort((a, b) => b - a);
  }, [data.transactions, month]);
  const tags = useMemo(() => distinctTags(data.transactions), [data.transactions]);

  const filtered = useMemo(() => filterTransactions(data.transactions, effective, data.categories), [data.transactions, effective, data.categories]);
  const sorted = useMemo(() => sortTransactions(filtered, sortKey, sortDir, data.categories), [filtered, sortKey, sortDir, data.categories]);
  const totals = useMemo(() => summarize(filtered, data.accounts), [filtered, data.accounts]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  useEffect(() => setPage(0), [effective, sortKey, sortDir, pageSize]);

  // Drop selections that are no longer in view (e.g. after a filter change or delete).
  useEffect(() => {
    setSelected((s) => {
      const keep = new Set([...s].filter((id) => filtered.some((t) => t.id === id)));
      return keep.size === s.size ? s : keep;
    });
  }, [filtered]);

  const patch = (p: Partial<TxFilter>) => setFilter((f) => ({ ...f, ...p }));
  const clearAll = () => {
    setFilter(EMPTY_FILTER);
    setPeriod('all');
    setCustom({ from: '', to: '' });
  };
  const active = isFilterActive(effective, true) || period !== 'month';

  const chosen = sorted.filter((t) => selected.has(t.id));
  const allOnPage = visible.length > 0 && visible.every((t) => selected.has(t.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const deleteChosen = async () => {
    const ok = await confirm({ title: `Delete ${chosen.length} transaction${chosen.length === 1 ? '' : 's'}?`, tone: 'danger', confirmLabel: 'Delete', message: 'Your totals and charts will update straight away. You can undo right after.' });
    if (!ok) return;
    dispatch({ type: 'deleteTxs', ids: chosen.map((t) => t.id) }, { undoable: true });
    setSelected(new Set());
    toast(`${chosen.length} transaction${chosen.length === 1 ? '' : 's'} deleted.`, { actions: [{ label: 'Undo', onClick: () => undo() }] });
  };

  const exportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`pace-transactions-${stamp}.csv`, transactionsToCsv(sorted, data), 'text/csv');
    toast(`Exported ${sorted.length} transaction${sorted.length === 1 ? '' : 's'}.`);
  };

  const periodLabel = period === 'month' ? formatMonthLabel(month) : period === 'year' ? String(year) : period === 'all' ? 'All time' : 'Custom range';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Transactions"
        subtitle="Search, filter and tidy up every entry. Click a category chip on any row to change it."
        actions={
          <>
            <Button icon={<Upload size={15} />} onClick={() => setImporting(true)}>
              Import CSV
            </Button>
            <Button icon={<Download size={15} />} onClick={exportCsv} disabled={sorted.length === 0}>
              Export
            </Button>
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => openAddTx()}>
              Add
            </Button>
          </>
        }
      />

      <NeedsAttention limit={4} />

      <Card className="!p-4 sm:!p-5" aria-label="Filters">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <TextInput type="search" value={filter.q} onChange={(e) => patch({ q: e.target.value })} placeholder="Search description, notes, tags, amount…" aria-label="Search transactions" className="pl-9" />
          </div>
          <Select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="!w-auto min-w-40">
            <option value="month">{formatMonthLabel(month)}</option>
            <option value="year">A whole year</option>
            <option value="all">All time</option>
            <option value="custom">Custom range</option>
          </Select>
          {period === 'year' && (
            <Select aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))} className="!w-auto">
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          )}
          <Button variant={showFilters ? 'soft' : 'outline'} icon={<Filter size={15} />} aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)}>
            Filters
          </Button>
          <div className="flex items-center gap-1">
            <Select aria-label="Sort by" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="!w-auto">
              <option value="date">Date</option>
              <option value="amount">Amount</option>
              <option value="description">Description</option>
              <option value="category">Category</option>
            </Select>
            <IconButton label={sortDir === 'desc' ? 'Sorted high to low. Switch to low to high' : 'Sorted low to high. Switch to high to low'} onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))} className="border border-line2 bg-surface">
              <ArrowDownUp size={16} className={sortDir === 'asc' ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </IconButton>
          </div>
        </div>

        {period === 'custom' && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
            <label className="flex items-center gap-2">
              From <input type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className={`${inputClass} !w-auto`} />
            </label>
            <label className="flex items-center gap-2">
              To <input type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className={`${inputClass} !w-auto`} />
            </label>
          </div>
        )}

        {showFilters && (
          <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-4 [animation:fade-in_0.15s_ease_both]">
            <Select aria-label="Type" value={filter.type} onChange={(e) => patch({ type: e.target.value as TxFilter['type'] })}>
              <option value="all">Income & expenses & transfers</option>
              <option value="expense">Expenses only</option>
              <option value="income">Income only</option>
              <option value="transfer">Savings transfers only</option>
            </Select>
            <Select aria-label="Category" value={filter.categoryId} onChange={(e) => patch({ categoryId: e.target.value })}>
              <option value="all">All categories</option>
              <option value="uncategorized">⚠️ Needs a category</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </Select>
            <Select aria-label="Payment method" value={filter.paymentMethod} onChange={(e) => patch({ paymentMethod: e.target.value })}>
              <option value="all">Any payment method</option>
              {data.settings.paymentMethods.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
              <option value="none">Not specified</option>
            </Select>
            <Select aria-label="Tag" value={filter.tag} onChange={(e) => patch({ tag: e.target.value })} disabled={tags.length === 0}>
              <option value="all">{tags.length ? 'Any tag' : 'No tags yet'}</option>
              {tags.map((t) => (
                <option key={t} value={t}>#{t}</option>
              ))}
            </Select>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-sm" aria-live="polite">
          <p className="text-muted">
            <strong className="font-semibold text-ink">{sorted.length}</strong> transaction{sorted.length === 1 ? '' : 's'} · {periodLabel}
            {active && (
              <button type="button" className="ml-3 inline-flex items-center gap-1 font-medium text-sage-deep hover:underline" onClick={clearAll}>
                <X size={12} /> Clear filters
              </button>
            )}
          </p>
          <p className="flex flex-wrap gap-x-4 text-muted tabular-nums">
            <span>In <strong className="font-semibold text-sage-deep">{fmt(totals.income)}</strong></span>
            <span>Out <strong className="font-semibold text-ink">{fmt(totals.expenses)}</strong></span>
            <span>Net <strong className={`font-semibold ${totals.net < 0 ? 'text-peach-deep' : 'text-ink'}`}>{fmt(totals.net, { signed: true })}</strong></span>
          </p>
        </div>
      </Card>

      {chosen.length > 0 && (
        <div role="region" aria-label="Bulk actions" className="sticky top-[4.25rem] z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-sage-deep/40 bg-sage-soft px-4 py-2.5 shadow-[var(--shadow-card)] [animation:fade-in_0.15s_ease_both]">
          <span className="text-sm font-semibold text-ink">{chosen.length} selected</span>
          <CategoryAssignButton types={[...new Set(chosen.map((t) => t.type))]} onAssign={(cid) => { categorize(chosen.map((t) => t.id), cid); setSelected(new Set()); }}>
            Set category
          </CategoryAssignButton>
          <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={deleteChosen}>
            Delete
          </Button>
          <button type="button" className="ml-auto text-sm font-medium text-sage-deep hover:underline" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      <Card className="!p-2 sm:!p-3" aria-label="Transaction list">
        {sorted.length === 0 ? (
          data.transactions.length === 0 ? (
            <EmptyState title="No transactions yet" action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => openAddTx()}>Add your first</Button>}>
              Add one by hand, or import a CSV from your bank.
            </EmptyState>
          ) : (
            <EmptyState title="Nothing matches" action={active ? <Button onClick={clearAll}>Clear filters</Button> : undefined}>
              Try a different search or widen the date range.
            </EmptyState>
          )
        ) : (
          <>
            <div className="flex items-center gap-3 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
              <input type="checkbox" checked={allOnPage} onChange={() => setSelected(allOnPage ? new Set() : new Set(visible.map((t) => t.id)))} aria-label="Select all on this page" className="h-4 w-4 accent-[var(--c-sage-deep)]" />
              <span>Select page</span>
            </div>
            <div className="flex flex-col">
              {visible.map((t) => (
                <TransactionRow key={t.id} tx={t} category={catMap.get(t.categoryId)} accounts={data.accounts} selected={selected.has(t.id)} onToggle={toggle} />
              ))}
            </div>
            <nav aria-label="Pagination" className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 pb-1 pt-3 text-sm text-muted">
              <label className="flex items-center gap-2">
                Rows
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-8 rounded-lg border border-line2 bg-surface px-2 text-sm">
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <span className="tabular-nums">
                {safePage * pageSize + 1}–{Math.min(sorted.length, safePage * pageSize + pageSize)} of {sorted.length}
              </span>
              <div className="flex items-center gap-1">
                <IconButton label="Previous page" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                  <ChevronLeft size={18} />
                </IconButton>
                <span className="px-1 tabular-nums">{safePage + 1} / {pageCount}</span>
                <IconButton label="Next page" size="sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                  <ChevronRight size={18} />
                </IconButton>
              </div>
            </nav>
          </>
        )}
      </Card>

      {importing && <ImportWizard onClose={() => setImporting(false)} />}
    </div>
  );
}
