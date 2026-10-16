import { createEmptyData } from './defaults';
import { SPECIAL, type AppData, type Transaction } from './types';

let n = 0;

/** Build a transaction for tests with sensible defaults. */
export function tx(over: Partial<Transaction> & Pick<Transaction, 'amount'>): Transaction {
  n++;
  return {
    id: `t${n}`,
    date: '2026-10-01',
    type: 'expense',
    description: 'Test',
    categoryId: 'food',
    categorySource: 'manual',
    tags: [],
    accountId: SPECIAL.mainAccount,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

export function dataWith(txs: Transaction[], patch: Partial<AppData> = {}): AppData {
  return { ...createEmptyData(), transactions: txs, ...patch };
}
