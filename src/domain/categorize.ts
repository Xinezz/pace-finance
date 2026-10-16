/**
 * Categorization engine.
 *
 * Precedence (highest first), and the guarantee that matters most:
 *   1. manual   - the user's own choice. NOTHING in this file ever overwrites it.
 *   2. rule     - a preference the user asked us to remember.
 *   3. auto     - built-in keyword suggestion (optional, can be turned off in Settings).
 *   4. none     - "Other / Uncategorized", surfaced under "Needs Your Attention".
 */
import { SPECIAL, type AppData, type Category, type CategoryRule, type CategorySource, type Transaction, type TxType } from './types';
import { uid } from './ids';

/** Lowercase letters only, digits/punctuation removed: "ABC Store #12" -> "abc store". */
export function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/['’`]/g, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The key we remember for a description, or null when it has no letters to learn from. */
export function ruleKeyFor(desc: string): string | null {
  const key = normalizeDescription(desc);
  return key.length >= 2 ? key : null;
}

function containsPhrase(normalized: string, phrase: string): boolean {
  return ` ${normalized} `.includes(` ${phrase} `);
}

export function categoryAllowsType(cat: Category, type: TxType): boolean {
  if (type === 'transfer') return cat.type === 'transfer';
  if (cat.type === 'both') return true;
  return cat.type === type;
}

/** Categories a user may pick for a given transaction type. */
export function categoriesForType(categories: Category[], type: TxType): Category[] {
  return categories.filter((c) => categoryAllowsType(c, type));
}

/* ------------------------------------------------------------------ */
/* Built-in keyword suggestions (Singapore-flavoured, but generic too) */
/* ------------------------------------------------------------------ */

const KEYWORDS: Record<string, string[]> = {
  food: [
    'restaurant', 'cafe', 'coffee', 'starbucks', 'toast box', 'ya kun', 'kopitiam', 'hawker', 'mcdonalds', 'kfc',
    'burger king', 'subway', 'pizza', 'sushi', 'ramen', 'bubble tea', 'koi', 'liho', 'gong cha', 'grabfood',
    'foodpanda', 'deliveroo', 'lunch', 'dinner', 'breakfast', 'brunch', 'bakery', 'mala', 'dim sum',
    'food court', 'din tai fung', 'jollibee', 'tim hortons', 'old chang kee',
  ],
  groceries: [
    'fairprice', 'ntuc', 'cold storage', 'sheng siong', 'giant', 'redmart', 'supermarket', 'grocery', 'groceries',
    'don don donki', 'donki', 'market', 'wet market', 'prime supermarket', 'walmart', 'tesco', 'costco', 'aldi',
  ],
  transport: [
    'grab', 'gojek', 'comfortdelgro', 'comfort delgro', 'taxi', 'mrt', 'bus', 'ez link', 'ezlink', 'simplygo',
    'transit', 'petrol', 'shell', 'esso', 'caltex', 'parking', 'erp', 'uber', 'lyft', 'tada',
  ],
  travel: [
    'airline', 'airlines', 'scoot', 'singapore airlines', 'jetstar', 'airasia', 'agoda', 'booking com', 'airbnb',
    'hotel', 'hostel', 'expedia', 'trip com', 'klook', 'flight', 'visa fee', 'travel insurance',
  ],
  shopping: [
    'shopee', 'lazada', 'amazon', 'uniqlo', 'zara', 'h m', 'ikea', 'courts', 'harvey norman', 'taobao', 'qoo',
    'popular bookstore', 'daiso', 'muji', 'decathlon', 'apple store', 'carousell', 'shein', 'mall',
  ],
  housing: [
    'rent', 'mortgage', 'sp group', 'sp services', 'utilities', 'electricity', 'water bill', 'singtel', 'starhub',
    'simba', 'circles life', 'giga', 'broadband', 'internet', 'condo', 'maintenance fee', 'town council',
    'property tax', 'home insurance',
  ],
  health: [
    'clinic', 'doctor', 'pharmacy', 'guardian', 'watsons', 'unity', 'hospital', 'dental', 'dentist', 'physio',
    'gym', 'fitness', 'yoga', 'pilates', 'anytime fitness', 'active sg', 'activesg', 'health insurance', 'optical',
  ],
  entertainment: [
    'netflix', 'spotify', 'disney', 'youtube premium', 'apple music', 'hbo', 'cinema', 'golden village', 'shaw',
    'movie', 'steam', 'playstation', 'nintendo', 'xbox', 'concert', 'ticketmaster', 'sistic', 'karaoke', 'arcade',
  ],
  education: [
    'coursera', 'udemy', 'skillsfuture', 'tuition', 'school fee', 'university', 'textbook', 'kinokuniya', 'workshop',
    'course', 'linkedin learning', 'duolingo',
  ],
  personal: [
    'haircut', 'salon', 'barber', 'spa', 'massage', 'nails', 'beauty', 'sephora', 'skincare', 'cosmetics', 'facial',
  ],
  gifts: ['gift', 'donation', 'charity', 'red packet', 'ang bao', 'angbao', 'flowers', 'florist', 'present'],
  salary: ['salary', 'payroll', 'wages', 'bonus', 'paycheck', 'paycheque', 'dividend', 'interest', 'freelance', 'commission', 'allowance'],
};

type KeywordHit = { categoryId: string; len: number };

function keywordMatch(normalized: string, categories: Category[], type: TxType): KeywordHit | null {
  const byId = new Map(categories.map((c) => [c.id, c]));
  let best: KeywordHit | null = null;
  for (const [categoryId, words] of Object.entries(KEYWORDS)) {
    const cat = byId.get(categoryId);
    if (!cat || !categoryAllowsType(cat, type)) continue;
    for (const w of words) {
      const phrase = normalizeDescription(w);
      if (!phrase) continue;
      // Whole-word match: "grab" does not match "grabfood", which has its own (longer) keyword.
      const hit = containsPhrase(normalized, phrase);
      if (hit && (!best || phrase.length > best.len)) best = { categoryId, len: phrase.length };
    }
  }
  return best;
}

/** Find a remembered user preference for this description (longest pattern wins). */
export function matchRule(desc: string, rules: CategoryRule[], categories: Category[], type: TxType): CategoryRule | null {
  const normalized = normalizeDescription(desc);
  if (!normalized) return null;
  const byId = new Map(categories.map((c) => [c.id, c]));
  let best: CategoryRule | null = null;
  for (const r of rules) {
    const cat = byId.get(r.categoryId);
    if (!cat || !categoryAllowsType(cat, type)) continue;
    if (containsPhrase(normalized, r.pattern) && (!best || r.pattern.length > best.pattern.length)) best = r;
  }
  return best;
}

export interface Suggestion {
  categoryId: string;
  source: Exclude<CategorySource, 'manual'>;
}

/** Decide the starting category for a NEW transaction. Never used on a manually categorized one. */
export function suggestCategory(
  desc: string,
  type: TxType,
  data: Pick<AppData, 'categories' | 'rules' | 'settings'>,
): Suggestion {
  if (type === 'transfer') return { categoryId: SPECIAL.savings, source: 'rule' };
  const rule = matchRule(desc, data.rules, data.categories, type);
  if (rule) return { categoryId: rule.categoryId, source: 'rule' };
  if (data.settings.autoSuggest) {
    const hit = keywordMatch(normalizeDescription(desc), data.categories, type);
    if (hit) return { categoryId: hit.categoryId, source: 'auto' };
  }
  return { categoryId: SPECIAL.other, source: 'none' };
}

/** True when a transaction is waiting on the user to pick a category. */
export function needsCategory(t: Transaction): boolean {
  return t.type !== 'transfer' && t.categorySource === 'none';
}

/** True when the category was machine-suggested and the user has not confirmed it yet. */
export function needsReview(t: Transaction): boolean {
  return t.type !== 'transfer' && t.categorySource === 'auto';
}

/**
 * Re-run categorization over existing transactions after the user adds a rule.
 * Only touches transactions that are still `none` or `auto`; manual choices are never changed.
 */
export function applyRuleToExisting(
  txs: Transaction[],
  rule: CategoryRule,
  categories: Category[],
): { txs: Transaction[]; changed: number } {
  let changed = 0;
  const out = txs.map((t) => {
    if (t.categorySource === 'manual' || t.type === 'transfer') return t;
    if (t.categoryId === rule.categoryId && t.categorySource === 'rule') return t;
    const cat = categories.find((c) => c.id === rule.categoryId);
    if (!cat || !categoryAllowsType(cat, t.type)) return t;
    if (!containsPhrase(normalizeDescription(t.description), rule.pattern)) return t;
    changed++;
    return { ...t, categoryId: rule.categoryId, categorySource: 'rule' as const, updatedAt: Date.now() };
  });
  return { txs: out, changed };
}

/** Transactions that look like `desc` (same normalized description), excluding those already manual. */
export function findSimilar(txs: Transaction[], desc: string, excludeId?: string): Transaction[] {
  const key = ruleKeyFor(desc);
  if (!key) return [];
  return txs.filter(
    (t) => t.id !== excludeId && t.type !== 'transfer' && normalizeDescription(t.description) === key,
  );
}

export function makeRule(pattern: string, categoryId: string): CategoryRule {
  return { id: uid('rule'), pattern, categoryId, createdAt: Date.now() };
}

/**
 * Should we offer to remember this choice? Yes when the user has now manually put at least
 * two transactions with the same description into this category and no rule exists yet.
 */
export function shouldOfferRemember(
  txs: Transaction[],
  rules: CategoryRule[],
  desc: string,
  categoryId: string,
): { offer: boolean; key: string | null; matches: number } {
  const key = ruleKeyFor(desc);
  if (!key) return { offer: false, key: null, matches: 0 };
  if (rules.some((r) => r.pattern === key && r.categoryId === categoryId)) return { offer: false, key, matches: 0 };
  const matches = txs.filter(
    (t) => t.type !== 'transfer' && t.categorySource === 'manual' && t.categoryId === categoryId && normalizeDescription(t.description) === key,
  ).length;
  return { offer: matches >= 2, key, matches };
}
