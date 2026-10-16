/**
 * Demo data: seven months of believable (fictional) Singapore-flavoured activity, generated
 * relative to "today" so the dashboard always has a current month to look at.
 * Everything generated here carries `isDemo: true` so it can be told apart from real entries
 * and removed in one click.
 */
import { addDays, addMonths, currentMonthKey, daysInMonth, parseDateStr, todayStr } from './dates';
import { createEmptyData } from './defaults';
import { uid } from './ids';
import { SPECIAL, type AppData, type CategorySource, type Goal, type GoalEntry, type Transaction, type TxType } from './types';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dollars = (n: number) => Math.round(n * 100);

export function createDemoData(today: string = todayStr()): AppData {
  const rnd = mulberry32(20261015);
  const chance = (p: number) => rnd() < p;
  const between = (min: number, max: number) => dollars(min + rnd() * (max - min));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

  const data = createEmptyData();
  const txs: Transaction[] = [];
  const nowTs = Date.now();

  const add = (
    date: string,
    type: TxType,
    description: string,
    amount: number,
    categoryId: string,
    extra: Partial<Transaction> = {},
    source: CategorySource = 'manual',
  ) => {
    if (date > today) return;
    txs.push({
      id: uid('tx'),
      type,
      description,
      amount,
      date,
      categoryId,
      categorySource: type === 'transfer' ? 'rule' : source,
      tags: [],
      accountId: SPECIAL.mainAccount,
      isDemo: true,
      createdAt: nowTs,
      updatedAt: nowTs,
      ...extra,
    });
  };

  const thisMonth = currentMonthKey(parseDateStr(today));
  const MONTHS_BACK = 6;
  const keyAt = (i: number) => addMonths(thisMonth, -i);
  const day = (key: string, d: number) => `${key}-${String(Math.min(d, daysInMonth(key))).padStart(2, '0')}`;

  const goalIds = { emergency: uid('goal'), holiday: uid('goal'), laptop: uid('goal') };

  for (let i = MONTHS_BACK; i >= 0; i--) {
    const key = keyAt(i);
    const dim = daysInMonth(key);

    // Income
    add(day(key, 3), 'income', 'Salary - Acme Studio', dollars(4200), SPECIAL.salary, { paymentMethod: 'Bank transfer', tags: ['salary'] });
    if (i === 4) add(day(key, 17), 'income', 'Freelance design project', dollars(650), SPECIAL.salary, { paymentMethod: 'PayNow', tags: ['freelance'] });
    if (i === 1) add(day(key, 19), 'income', 'Freelance logo work', dollars(480), SPECIAL.salary, { paymentMethod: 'PayNow', tags: ['freelance'] });
    if (i === 2) add(day(key, 28), 'income', 'Bonus payout', dollars(800), SPECIAL.salary, { paymentMethod: 'Bank transfer' });

    // Bills & subscriptions
    add(day(key, 1), 'expense', 'Rent - room', dollars(1400), 'housing', { paymentMethod: 'Bank transfer', tags: ['recurring'] });
    add(day(key, 8), 'expense', 'SP Group utilities', between(72, 118), 'housing', { paymentMethod: 'Credit card', tags: ['recurring'] });
    add(day(key, 12), 'expense', 'Singtel Mobile', dollars(34.9), 'housing', { paymentMethod: 'Credit card', tags: ['recurring'] });
    add(day(key, 15), 'expense', 'StarHub Broadband', dollars(29.99), 'housing', { paymentMethod: 'Credit card', tags: ['recurring'] });
    add(day(key, 14), 'expense', 'Netflix', dollars(15.98), 'entertainment', { paymentMethod: 'Credit card', tags: ['recurring'] });
    add(day(key, 20), 'expense', 'Spotify', dollars(10.98), 'entertainment', { paymentMethod: 'Credit card', tags: ['recurring'] });
    add(day(key, 4), 'expense', 'Anytime Fitness', dollars(58), 'health', { paymentMethod: 'Credit card', tags: ['recurring'] });
    if (i % 2 === 0) add(day(key, 9), 'expense', 'Coursera subscription', dollars(49), 'education', { paymentMethod: 'Credit card', tags: ['recurring'] });

    // Savings transfers (move money between accounts - not income, not an expense)
    const savingsBase: Partial<Transaction> = { accountId: SPECIAL.mainAccount, toAccountId: SPECIAL.savingsAccount, paymentMethod: 'Bank transfer', tags: ['savings'] };
    add(day(key, 5), 'transfer', 'Transfer to Emergency fund', dollars(400), SPECIAL.savings, { ...savingsBase, goalId: goalIds.emergency });
    add(day(key, 5), 'transfer', 'Transfer to Holiday fund', dollars(200), SPECIAL.savings, { ...savingsBase, goalId: goalIds.holiday });

    // Everyday spending, day by day
    for (let d = 1; d <= dim; d++) {
      const date = day(key, d);
      if (date > today) break;
      const dow = parseDateStr(date).getDay();
      const weekend = dow === 0 || dow === 6;

      if (!weekend && chance(0.8)) {
        if (chance(0.6)) add(date, 'expense', pick(['Hawker lunch', 'Kopitiam lunch', 'Toast Box', 'Ya Kun Kaya Toast', 'Chicken rice']), between(5, 9.5), 'food', { paymentMethod: pick(['Cash', 'E-wallet', 'PayNow']), tags: chance(0.3) ? ['work'] : [] });
        else add(date, 'expense', pick(['Lunch at food court', 'Subway', 'Sushi Express', "McDonald's"]), between(10, 17), 'food', { paymentMethod: 'Debit card', tags: chance(0.4) ? ['work'] : [] });
      }
      if (chance(0.42)) add(date, 'expense', pick(['Starbucks', 'Coffee', 'Kopi & kaya toast', 'Liho tea']), between(4.5, 7.5), 'food', { paymentMethod: pick(['E-wallet', 'Cash', 'Credit card']) });
      if (chance(weekend ? 0.7 : 0.3)) add(date, 'expense', pick(['GrabFood dinner', 'Foodpanda', 'Dinner - hawker', 'Mala xiang guo']), between(12, 30), 'food', { paymentMethod: 'Credit card' });
      if (weekend && chance(0.35)) add(date, 'expense', pick(['Din Tai Fung', 'Dinner with friends', 'Brunch at cafe', 'Korean BBQ']), between(38, 82), 'food', { paymentMethod: 'Credit card', tags: ['treat'] });

      if (!weekend && chance(0.35)) add(date, 'expense', 'Grab ride', between(8, 24), 'transport', { paymentMethod: 'E-wallet' });
      if (d === 6 || d === 21) add(date, 'expense', 'MRT top-up', dollars(d === 6 ? 20 : 25), 'transport', { paymentMethod: 'Debit card' });

      if (dow === 0 && chance(0.85)) add(date, 'expense', pick(['NTUC FairPrice', 'Cold Storage', 'Sheng Siong']), between(48, 112), 'groceries', { paymentMethod: 'Debit card' });
      if (dow === 3 && chance(0.4)) add(date, 'expense', pick(['NTUC FairPrice', 'Sheng Siong']), between(14, 36), 'groceries', { paymentMethod: 'Debit card' });

      if (weekend && chance(0.14)) add(date, 'expense', pick(['Shopee order', 'Uniqlo', 'Lazada order', 'Daiso', 'Zara']), between(14, 92), 'shopping', { paymentMethod: pick(['Credit card', 'E-wallet']) });
      if (weekend && chance(0.07)) add(date, 'expense', pick(['Golden Village movie', 'Steam game', 'Karaoke night']), between(12, 28), 'entertainment', { paymentMethod: 'Credit card' });
      if (chance(0.03)) add(date, 'expense', pick(['Guardian pharmacy', 'Clinic visit', 'Watsons']), between(9, 48), 'health', { paymentMethod: 'Debit card' });
    }
    if (chance(0.75)) add(day(key, 18), 'expense', 'Haircut', dollars(28), 'personal', { paymentMethod: 'Cash' });
    if (chance(0.4)) add(day(key, 23), 'expense', 'Sephora', between(38, 78), 'personal', { paymentMethod: 'Credit card' });
    if (i % 2 === 1) add(day(key, 11), 'expense', pick(['Birthday gift - Mei', 'Donation - SPCA', 'Wedding ang bao']), between(30, 80), 'gifts', { paymentMethod: 'Cash', tags: ['gift'] });

    // A trip, a spike, and a refund
    if (i === 3) {
      add(day(key, 6), 'expense', 'Scoot flights to Bangkok', dollars(428.6), 'travel', { paymentMethod: 'Credit card', tags: ['trip'] });
      add(day(key, 6), 'expense', 'Agoda hotel Bangkok', dollars(312.4), 'travel', { paymentMethod: 'Credit card', tags: ['trip'] });
      for (const [d, label, amt] of [[22, 'Bangkok street food', 38], [23, 'Chatuchak market', 85], [24, 'Grab Bangkok', 22], [25, 'Thai massage', 40]] as const) {
        add(day(key, d), 'expense', label, dollars(amt), d === 22 ? 'food' : d === 23 ? 'shopping' : d === 24 ? 'transport' : 'personal', { paymentMethod: 'Cash', tags: ['trip'] });
      }
    }
    if (i === 1) {
      add(day(key, 13), 'expense', 'Apple Store - iPad accessories', dollars(289), 'shopping', { paymentMethod: 'Credit card' });
      add(day(key, 21), 'expense', 'Shopee refund - damaged item', dollars(29.9), 'shopping', { paymentMethod: 'E-wallet', refund: true });
      add(day(key, 20), 'expense', 'ABC Store', dollars(18.5), 'shopping', { paymentMethod: 'Cash' }, 'manual');
    }
    if (i === 0) {
      add(day(key, 10), 'expense', 'IKEA - desk lamp & shelf', dollars(185), 'housing', { paymentMethod: 'Credit card' }, 'manual');
      add(day(key, 11), 'expense', 'Shopee refund - wrong size', dollars(34.9), 'shopping', { paymentMethod: 'E-wallet', refund: true });
    }
  }

  // Things the app can't identify on its own - these land in "Needs Your Attention".
  const uncategorized: [number, string, number][] = [
    [2, 'ABC Store', 23.4],
    [6, 'Online Purchase', 45.9],
    [9, 'Transfer 003', 120],
    [13, 'PAYNOW 8821', 36],
  ];
  for (const [offset, label, amt] of uncategorized) {
    const date = addDays(today, -offset);
    add(date, 'expense', label, dollars(amt), SPECIAL.other, { paymentMethod: label.startsWith('PAYNOW') ? 'PayNow' : 'Debit card' }, 'none');
  }
  // A couple of keyword-based suggestions waiting to be confirmed.
  add(addDays(today, -3), 'expense', 'Sheng Siong supermarket', dollars(64.2), 'groceries', { paymentMethod: 'Debit card' }, 'auto');
  add(addDays(today, -5), 'expense', 'Grabfood late night', dollars(21.8), 'food', { paymentMethod: 'E-wallet' }, 'auto');

  data.transactions = txs;

  // Accounts: demo opening balances, flagged so "clear demo data" can reset them.
  data.accounts = [
    { id: SPECIAL.mainAccount, name: 'Main account', kind: 'spending', openingBalance: dollars(2400), isDemo: true },
    { id: SPECIAL.savingsAccount, name: 'Savings account', kind: 'savings', openingBalance: dollars(7500), isDemo: true },
  ];

  const startDate = addDays(`${keyAt(MONTHS_BACK)}-01`, 0);
  const goals: Goal[] = [
    { id: goalIds.emergency, name: 'Emergency fund', target: dollars(15000), startingAmount: dollars(5500), targetDate: `${addMonths(thisMonth, 22)}-28`, description: 'Six months of living costs, just in case.', icon: '🛟', color: '#A8B5A0', startDate, isDemo: true },
    { id: goalIds.holiday, name: 'Holiday fund - Japan', target: dollars(4000), startingAmount: dollars(1000), targetDate: `${addMonths(thisMonth, 5)}-15`, description: 'Cherry blossom season.', icon: '🌸', color: '#E2A3B5', startDate, isDemo: true },
    { id: goalIds.laptop, name: 'New laptop', target: dollars(2400), startingAmount: 0, targetDate: `${addMonths(thisMonth, 7)}-30`, description: 'Replace the old one before it gives up.', icon: '💻', color: '#B8C9D6', startDate: `${keyAt(3)}-01`, isDemo: true },
  ];
  const entries: GoalEntry[] = [
    { id: uid('ge'), goalId: goalIds.laptop, amount: dollars(600), date: day(keyAt(2), 6), note: 'Set aside from existing savings', isDemo: true },
  ];
  data.goals = goals;
  data.goalEntries = entries;

  data.budgets = [
    { categoryId: 'food', amount: dollars(450) },
    { categoryId: 'groceries', amount: dollars(400) },
    { categoryId: 'transport', amount: dollars(160) },
    { categoryId: 'shopping', amount: dollars(250) },
    { categoryId: 'entertainment', amount: dollars(120) },
    { categoryId: 'health', amount: dollars(120) },
    { categoryId: 'personal', amount: dollars(80) },
    { categoryId: 'housing', amount: dollars(1650) },
  ];

  data.settings.monthlySavingsTarget = dollars(1000);
  data.settings.userName = '';
  data.meta.mode = 'demo';
  data.meta.onboarded = true;
  return data;
}
