# Pace — your money, your pace

A calm, local-first personal finance and savings tracker. Track income, expenses and savings goals, sort every
transaction the way *you* want, and see exactly where your money goes. No bank connections, no accounts, no server:
everything lives in your browser.

## Run it

You need Node.js 20.19 or newer.

```bash
npm install        # install dependencies
npm run dev        # start the dev server at http://localhost:5173
```

```bash
npm run build      # type-check, then build to dist/
npm run preview    # serve the production build locally
npm test           # run the 120+ unit tests
npm run typecheck  # TypeScript only
```

On first launch you can **explore with demo data** (seven months of made-up transactions, clearly marked "Demo") or
**start fresh** (a short onboarding for your name, currency, starting balances and budgets).

## What's inside

| Page | What it does |
| --- | --- |
| **Dashboard** | Total balance, income, expenses, savings and savings rate for the selected month, with comparisons, data-driven insights, top categories, goals and recent activity. |
| **Transactions** | Add / edit / delete, search, filter (date range, month/year, type, category, payment method, tag), sort, paginate, bulk select, CSV import and export. |
| **Analytics** | Donut chart with click-through to the transactions behind each slice, spending distribution, income vs expenses (weekly / monthly / yearly), savings over time, category trends vs last month, insights. Every chart has a table view. |
| **Budgets** | Monthly limit per category with sage / yellow / peach status, warnings at 80% and 100%, and a clearly labelled end-of-month *estimate*. |
| **Savings** | Goals with progress, remaining amount, pace status and target date; contributions and withdrawals; a monthly savings target; milestone celebrations. |
| **Calendar** | Daily income / spending heat map, higher-than-usual days, recurring bills, a day detail panel and an activity timeline. |
| **Reports** | Monthly, annual, category, savings and month-by-month reports; print / save as PDF, Markdown summary, CSV export. |
| **Settings** | Currency, theme, accounts, categories, remembered preferences, quick actions, payment methods, backup / restore, demo data controls. |

Press **N** anywhere to add a transaction.

## Manual categorization comes first

The app is built around you deciding where things belong:

1. **Your choice always wins.** A category you pick by hand is stored as `manual` and nothing — rules, keyword
   suggestions, imports, edits — can overwrite it.
2. **Needs Your Attention** lists uncategorized transactions with one-tap category chips, bulk assignment, and a
   keyboard-driven *Categorize one by one* flow (`1`–`9` to choose, `S` to skip).
3. **Teach it once.** After you categorize similar descriptions the same way, Pace offers to remember it (and fix the
   similar ones still waiting). Manage these in Settings → Remembered preferences.
4. **Suggestions are optional and visible.** Well-known merchants (Grab, NTUC, Netflix…) get an "auto" label until you
   confirm them. Turn suggestions off entirely in Settings and everything unknown goes to Needs Your Attention.
5. **Custom categories** — create, rename, recolour, change the icon, delete. Deleting returns its transactions to
   Needs Your Attention rather than silently moving them.

Precedence: **manual › remembered preference › built-in suggestion › uncategorized.**

## Financial rules (one place: `src/domain/calc.ts`)

- Total income = sum of income in the period. Total expenses = expenses minus refunds.
- Net cash flow = income − expenses. Savings rate = net ÷ income × 100 (only when income > 0).
- Category share = category ÷ total expenses × 100. Budget used = spent ÷ budget × 100. Goal completion = saved ÷ target × 100.
  Each returns "no value" instead of dividing by zero, so the UI never shows `NaN` or `Infinity`.
- **Transfers between your own accounts are never income or expenses.** A savings transfer changes balances, not cash flow.
- Three savings figures are kept apart: *left after income & expenses* (period cash flow), *held in savings accounts*
  (a balance), and *assigned to goals*. They reconcile: held = assigned + unassigned.
- Money is stored as **integer minor units** (cents). Dates are local `YYYY-MM-DD` strings, so month boundaries never
  shift with the time zone.
- Mid-month comparisons use the *same point last month*, not the whole of last month.

## Data & privacy

- Stored in **IndexedDB** in your browser (falls back to localStorage, then memory with a visible warning).
- Saves write only what changed. Nothing is ever sent anywhere.
- **Backup / restore** as a JSON file; restores are validated, and corrupt rows are skipped and reported.
- **CSV import** has a column-mapping step, a validated preview, and duplicate protection (re-importing a file adds nothing).
- Demo data is flagged `isDemo` on every record, so clearing it never touches what you entered yourself.

## Architecture

```
src/
  domain/      Pure TypeScript: types, money, dates, calc, categorize, insights, importer, report, demo. No React.
  storage/     DataStore interface + IndexedDB / localStorage / memory stores, backup validation (sanitize.ts).
  state/       Pure reducer, React store (persistence, undo, milestones), toasts/confirm, hash router.
  components/  UI primitives, category pickers, charts (Recharts), transaction modal and rows, import wizard, layout.
  features/    One folder per page.
```

Key decisions:

- **Local-first behind an interface.** The UI only talks to `DataStore`. Moving to a real database with sign-in means
  writing one new class (plus an API); no component changes.
- **A pure reducer** holds every state rule (what a deleted category does, how currency changes rescale amounts…), so
  they are unit-tested without a browser.
- **Derived, not stored.** Totals, percentages, insights, notifications and projections are always computed from the
  transactions, so editing anything updates everything.
- **Native `<dialog>`** for modals (focus trap, Escape, inert background for free); bottom sheets on phones.
- Tailwind v4 design tokens with a real dark theme (not an inversion); text pairs checked against WCAG AA.

## Tests

`npm test` covers money parsing and formatting, local-date handling, every calculation in the financial rules
(including zero income, zero expenses, refunds, savings transfers, empty periods), categorization precedence, the
reducer, filtering and sorting, CSV import/export and duplicate detection, reports, demo-data consistency, IndexedDB
persistence (against `fake-indexeddb`), and backup/restore validation.

## Limitations

- **One browser, one device.** Data doesn't sync. Use backup / restore to move it. Use one tab at a time; two tabs
  editing at once can overwrite each other.
- Clearing the site's data in your browser erases Pace's data. Keep a backup.
- **No bank connection** by design; use CSV import.
- Changing currency changes the display only. It doesn't convert amounts.
- Bills aren't auto-posted. Recurring charges are *detected* from history (same description, similar amount, steady day
  of month in three or more months) and used for projections and the calendar.
- The end-of-month projection is a rough estimate and says so.
- There is no sign-in. A real multi-user version needs a backend and authentication, which is intentionally not included.

## Accounts and cloud sync (optional)

Out of the box Pace is local-only. To add sign-in and sync across devices, connect a free Supabase project: see
[`supabase/SETUP.md`](supabase/SETUP.md). Each person's data then lives in their own private row, enforced by
Row Level Security in the database, with email + password sign-in, password reset, change password and
account deletion. If another device saved first, Pace asks which copy to keep instead of overwriting.

`npm run dev:mock` lets you try every sign-in screen with a pretend backend (development only, not secure).
Real keys go in `.env.local`, which is git-ignored. Use the publishable key (`sb_publishable_…`); never a secret key, which Pace refuses to run with.
