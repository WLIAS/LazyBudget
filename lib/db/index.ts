// lib/db/index.ts — Dexie singleton

import Dexie, { type Table } from 'dexie';
import type {
  Transaction,
  Account,
  Category,
  CategorisationRule,
  Budget,
  ImportBatch,
} from './schema';

export class LazyBudgetDB extends Dexie {
  transactions!: Table<Transaction, string>;
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  rules!: Table<CategorisationRule, string>;
  budgets!: Table<Budget, string>;
  importBatches!: Table<ImportBatch, string>;

  constructor() {
    super('LazyBudgetDB');
    this.version(1).stores({
      transactions:
        'id, date, accountId, categoryId, payee, importBatchId, isTransfer, categorySource',
      accounts: 'id, name, label',
      categories: 'id, name, group, isSystem',
      rules: 'id, type, matchField, categoryId, priority, createdBy',
      budgets: 'id, categoryId, period, effectiveFrom',
      importBatches: 'id, accountId, importedAt',
    });
  }
}

// Singleton — safe to import in client components
let _db: LazyBudgetDB | null = null;

export function getDB(): LazyBudgetDB {
  if (!_db) {
    _db = new LazyBudgetDB();
  }
  return _db;
}

export { type Transaction, type Account, type Category, type CategorisationRule, type Budget, type ImportBatch };
