import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Copy, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { parseCsv } from '../../domain/csv';
import { buildImportRows, guessMapping, IMPORT_FIELDS, type DateFormat, type ImportField, type Mapping } from '../../domain/importer';
import { formatDate } from '../../domain/dates';
import { useFeedback } from '../../state/feedback';
import { useMoney, useStore } from '../../state/store';
import { useUi } from '../../state/ui';
import { needsCategory } from '../../domain/categorize';
import { CategoryChip } from '../category/CategoryChip';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Feedback';
import { Field, Select } from '../ui/Form';
import { Modal } from '../ui/Modal';

const MAX_BYTES = 5 * 1024 * 1024;
const PREVIEW_ROWS = 200;

type Step = 'file' | 'map' | 'preview' | 'done';

export function ImportWizard({ onClose }: { onClose: () => void }) {
  const { data, dispatch, undo } = useStore();
  const { fmt } = useMoney();
  const { toast } = useFeedback();
  const { openCategorize } = useUi();

  const [step, setStep] = useState<Step>('file');
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Mapping>({});
  const [dateFormat, setDateFormat] = useState<DateFormat>('dmy');
  const [positiveIsExpense, setPositiveIsExpense] = useState(false);
  const [accountId, setAccountId] = useState(data.accounts.find((a) => a.kind === 'spending')?.id ?? data.accounts[0]?.id ?? '');
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [includeDup, setIncludeDup] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<{ count: number; uncategorized: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const headers = useMemo(() => (table[0] ? (hasHeader ? table[0].map((h, i) => h.trim() || `Column ${i + 1}`) : table[0].map((_, i) => `Column ${i + 1}`)) : []), [table, hasHeader]);
  const body = useMemo(() => (hasHeader ? table.slice(1) : table), [table, hasHeader]);

  const rows = useMemo(
    () => (step === 'preview' || step === 'done' ? buildImportRows(body, mapping, { dateFormat, positiveIsExpense, accountId }, data) : []),
    [step, body, mapping, dateFormat, positiveIsExpense, accountId, data],
  );
  const counts = useMemo(() => ({ ok: rows.filter((r) => r.status === 'ok').length, duplicate: rows.filter((r) => r.status === 'duplicate').length, error: rows.filter((r) => r.status === 'error').length }), [rows]);
  const selectedRows = rows.filter((r) => r.tx && ((r.status === 'ok' && !skipped.has(r.index)) || (r.status === 'duplicate' && includeDup.has(r.index))));

  const loadFile = async (file: File) => {
    setError(null);
    if (file.size > MAX_BYTES) return setError('That file is larger than 5 MB. Try splitting it into smaller files.');
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length < 2) return setError('We couldn’t find any rows in that file. Is it a CSV with a header line?');
      setTable(parsed);
      setFileName(file.name);
      setMapping(guessMapping(parsed[0].map((h) => h.trim())));
      setHasHeader(true);
      setSkipped(new Set());
      setIncludeDup(new Set());
      setStep('map');
    } catch {
      setError('We couldn’t read that file. Please choose a .csv file.');
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void loadFile(f);
  };

  const setCol = (field: ImportField, value: string) =>
    setMapping((m) => {
      const next = { ...m };
      if (value === '') delete next[field];
      else next[field] = Number(value);
      return next;
    });

  const hasAmount = mapping.amount !== undefined || mapping.debit !== undefined || mapping.credit !== undefined;
  const canPreview = mapping.date !== undefined && mapping.description !== undefined && hasAmount;

  const toggleRow = (index: number, status: 'ok' | 'duplicate') => {
    if (status === 'ok') {
      setSkipped((s) => {
        const n = new Set(s);
        if (n.has(index)) n.delete(index);
        else n.add(index);
        return n;
      });
    } else {
      setIncludeDup((s) => {
        const n = new Set(s);
        if (n.has(index)) n.delete(index);
        else n.add(index);
        return n;
      });
    }
  };

  const doImport = () => {
    const txs = selectedRows.map((r) => r.tx!);
    if (txs.length === 0) return;
    dispatch({ type: 'addTxs', txs }, { undoable: true });
    const added = txs.length;
    const unc = txs.filter(needsCategory).length;
    setResult({ count: added, uncategorized: unc });
    setStep('done');
    toast(`Imported ${added} transaction${added === 1 ? '' : 's'}.`, { actions: [{ label: 'Undo', onClick: () => undo() }] });
  };

  const sample = body.slice(0, 3);

  return (
    <Modal title="Import transactions" description="Bring in a CSV from your bank or a spreadsheet. Nothing leaves your device." onClose={onClose} width="58rem">
      <div className="flex flex-col gap-5">
        <ol className="flex items-center gap-2 text-xs" aria-label="Import steps">
          {(['file', 'map', 'preview', 'done'] as Step[]).map((s, i) => {
            const labels = { file: 'Choose file', map: 'Match columns', preview: 'Review', done: 'Done' };
            const idx = ['file', 'map', 'preview', 'done'].indexOf(step);
            return (
              <li key={s} className={`flex items-center gap-2 ${i <= idx ? 'text-ink' : 'text-muted'}`} aria-current={s === step ? 'step' : undefined}>
                <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold ${i < idx ? 'bg-sage-deep text-white' : i === idx ? 'bg-primary text-on-primary' : 'bg-surface2'}`}>{i < idx ? '✓' : i + 1}</span>
                <span className="hidden sm:inline">{labels[s]}</span>
                {i < 3 && <span className="h-px w-5 bg-line2 sm:w-8" />}
              </li>
            );
          })}
        </ol>

        {step === 'file' && (
          <div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-14 text-center transition-colors ${dragging ? 'border-sage-deep bg-sage-soft' : 'border-line2 bg-surface2/50'}`}
            >
              <span className="grid h-14 w-14 place-items-center rounded-full bg-sage-soft text-sage-deep"><UploadCloud size={26} /></span>
              <p className="font-serif text-xl text-ink">Drop a CSV file here</p>
              <p className="text-sm text-muted">or</p>
              <Button variant="primary" onClick={() => inputRef.current?.click()} data-autofocus>Choose a file</Button>
              <input ref={inputRef} type="file" accept=".csv,.txt,text/csv" className="sr-only" aria-label="CSV file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ''; }} />
            </div>
            {error && <p role="alert" className="mt-3 flex items-center gap-2 text-sm font-medium text-peach-deep"><AlertTriangle size={16} /> {error}</p>}
            <div className="mt-5 rounded-2xl bg-surface2 p-4 text-sm text-muted">
              <p className="font-medium text-ink">What works</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                <li>Any CSV with a date, a description and an amount (one column, or separate money-in and money-out columns).</li>
                <li>Importing the same file twice is safe: rows you already have are spotted and left out.</li>
                <li>A file you exported from Pace imports cleanly too.</li>
              </ul>
            </div>
          </div>
        )}

        {step === 'map' && (
          <div className="flex flex-col gap-5">
            <p className="flex items-center gap-2 text-sm text-muted"><FileSpreadsheet size={16} className="text-sage-deep" /> <strong className="text-ink">{fileName}</strong> · {body.length} rows found</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hasHeader} onChange={(e) => { setHasHeader(e.target.checked); setMapping(guessMapping(e.target.checked ? table[0].map((h) => h.trim()) : [])); }} className="h-4 w-4 accent-[var(--c-sage-deep)]" /> The first row has column names</label>
            <div className="grid gap-4 sm:grid-cols-2">
              {IMPORT_FIELDS.map((f) => (
                <Field key={f.field} label={f.label} required={f.required} hint={f.hint}>
                  <Select value={mapping[f.field] === undefined ? '' : String(mapping[f.field])} onChange={(e) => setCol(f.field, e.target.value)}>
                    <option value="">{f.required ? 'Choose a column…' : 'Not in this file'}</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h}</option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
            <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <Field label="Date format" required hint="Matters for dates like 05/10/2026.">
                <Select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
                  <option value="dmy">Day / Month / Year</option>
                  <option value="mdy">Month / Day / Year</option>
                  <option value="iso">Year-Month-Day (2026-10-05)</option>
                </Select>
              </Field>
              <Field label="Import into account" required>
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {data.accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
              </Field>
              {mapping.amount !== undefined && mapping.type === undefined && (
                <label className="flex items-start gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={positiveIsExpense} onChange={(e) => setPositiveIsExpense(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--c-sage-deep)]" />
                  <span><span className="font-medium text-ink">Positive amounts are spending</span><span className="block text-xs text-muted">Turn this on for credit-card statements, where purchases show as positive numbers.</span></span>
                </label>
              )}
            </div>
            {sample.length > 0 && (
              <div className="overflow-x-auto rounded-2xl border border-line">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">First rows of your file</caption>
                  <thead className="bg-surface2 text-muted"><tr>{headers.map((h, i) => <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>{sample.map((r, i) => <tr key={i} className="border-t border-line">{headers.map((_, c) => <td key={c} className="max-w-48 truncate px-3 py-1.5">{r[c]}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}
            {!canPreview && <p className="text-sm text-peach-deep" role="status">Choose a column for date, description and amount (or money in / money out) to continue.</p>}
            <div className="flex justify-between">
              <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={() => setStep('file')}>Back</Button>
              <Button variant="primary" disabled={!canPreview} onClick={() => setStep('preview')}>Preview <ArrowRight size={15} /></Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-sage-soft p-3"><p className="font-serif text-2xl text-sage-deep tabular-nums">{counts.ok}</p><p className="text-xs text-sage-deep">ready to import</p></div>
              <div className="rounded-2xl bg-butter-soft p-3"><p className="font-serif text-2xl text-butter-deep tabular-nums">{counts.duplicate}</p><p className="text-xs text-butter-deep">already in Pace</p></div>
              <div className="rounded-2xl bg-peach-soft p-3"><p className="font-serif text-2xl text-peach-deep tabular-nums">{counts.error}</p><p className="text-xs text-peach-deep">can’t be read</p></div>
            </div>
            <div className="max-h-[22rem] overflow-auto rounded-2xl border border-line">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Preview of rows to import</caption>
                <thead className="sticky top-0 bg-surface2 text-xs text-muted">
                  <tr><th scope="col" className="w-10 px-3 py-2"><span className="sr-only">Include</span></th><th scope="col" className="px-3 py-2 font-medium">Date</th><th scope="col" className="px-3 py-2 font-medium">Description</th><th scope="col" className="px-3 py-2 font-medium">Category</th><th scope="col" className="px-3 py-2 text-right font-medium">Amount</th><th scope="col" className="px-3 py-2 font-medium">Status</th></tr>
                </thead>
                <tbody>
                  {rows.slice(0, PREVIEW_ROWS).map((r) => {
                    const t = r.tx;
                    const checked = r.status === 'ok' ? !skipped.has(r.index) : r.status === 'duplicate' ? includeDup.has(r.index) : false;
                    return (
                      <tr key={r.index} className={`border-t border-line ${r.status === 'error' ? 'bg-peach-soft/40' : r.status === 'duplicate' ? 'bg-butter-soft/40' : ''}`}>
                        <td className="px-3 py-2">{r.status !== 'error' && <input type="checkbox" checked={checked} onChange={() => toggleRow(r.index, r.status as 'ok' | 'duplicate')} aria-label={`Include row ${r.index + 1}`} className="h-4 w-4 accent-[var(--c-sage-deep)]" />}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted">{t ? formatDate(t.date, { day: 'numeric', month: 'short', year: '2-digit' }) : '-'}</td>
                        <td className="max-w-56 truncate px-3 py-2 text-ink">{t?.description ?? <span className="text-muted">{body[r.index]?.join(' · ').slice(0, 60)}</span>}</td>
                        <td className="px-3 py-2">{t && (t.type === 'transfer' ? <Badge>Transfer</Badge> : <CategoryChip size="sm" category={data.categories.find((c) => c.id === t.categoryId)} />)}</td>
                        <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${t?.type === 'income' || t?.refund ? 'text-sage-deep' : 'text-ink'}`}>{t ? `${t.type === 'income' || t.refund ? '+' : t.type === 'expense' ? '-' : ''}${fmt(t.amount)}` : '-'}</td>
                        <td className="px-3 py-2 text-xs">
                          {r.status === 'ok' && <span className="inline-flex items-center gap-1 text-sage-deep"><CheckCircle2 size={13} /> Ready</span>}
                          {r.status === 'duplicate' && <span className="inline-flex items-center gap-1 text-butter-deep"><Copy size={13} /> Duplicate</span>}
                          {r.status === 'error' && <span className="inline-flex items-center gap-1 text-peach-deep"><AlertTriangle size={13} /> {r.errors[0]}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > PREVIEW_ROWS && <p className="text-xs text-muted">Showing the first {PREVIEW_ROWS} of {rows.length} rows. All valid rows will be imported.</p>}
            <p className="text-xs text-muted">Duplicates are unticked by default. Rows without a clear category will be waiting for you under Needs Your Attention.</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={() => setStep('map')}>Back</Button>
              <Button variant="primary" disabled={selectedRows.length === 0} onClick={doImport}>Import {selectedRows.length} transaction{selectedRows.length === 1 ? '' : 's'}</Button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-sage-soft text-sage-deep"><CheckCircle2 size={30} /></span>
            <h3 className="font-serif text-2xl text-ink">Imported {result.count} transaction{result.count === 1 ? '' : 's'}</h3>
            <p className="max-w-sm text-sm text-muted">{result.uncategorized > 0 ? `${result.uncategorized} of them need a category. It only takes a moment, and you can teach Pace as you go.` : 'Everything was categorized automatically. You can review them any time.'}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {result.uncategorized > 0 && <Button variant="primary" onClick={() => { onClose(); openCategorize(); }}>Categorize now</Button>}
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
