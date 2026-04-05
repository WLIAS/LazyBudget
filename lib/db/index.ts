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
    // v1 — original schema
    this.version(1).stores({
      transactions:
        'id, date, accountId, categoryId, payee, importBatchId, isTransfer, categorySource',
      accounts: 'id, name, label',
      categories: 'id, name, group, isSystem',
      rules: 'id, type, matchField, categoryId, priority, createdBy',
      budgets: 'id, categoryId, period, effectiveFrom',
      importBatches: 'id, accountId, importedAt',
    });
    // v2 — transactions now use deterministic hash IDs; clear old UUID-keyed data
    this.version(2)
      .stores({
        transactions:
          'id, date, accountId, categoryId, payee, importBatchId, isTransfer, categorySource',
        accounts: 'id, name, label',
        categories: 'id, name, group, isSystem',
        rules: 'id, type, matchField, categoryId, priority, createdBy',
        budgets: 'id, categoryId, period, effectiveFrom',
        importBatches: 'id, accountId, importedAt',
      })
      .upgrade(async (tx) => {
        await tx.table('transactions').clear();
        await tx.table('importBatches').clear();
      });

    // v3 — remove duplicate categories (UUID + stable-ID coexistence)
    this.version(3)
      .stores({
        transactions:
          'id, date, accountId, categoryId, payee, importBatchId, isTransfer, categorySource',
        accounts: 'id, name, label',
        categories: 'id, name, group, isSystem',
        rules: 'id, type, matchField, categoryId, priority, createdBy',
        budgets: 'id, categoryId, period, effectiveFrom',
        importBatches: 'id, accountId, importedAt',
      })
      .upgrade(async (tx) => {
        const all = await tx.table('categories').toArray();
        // Keep stable sys-cat-* IDs; delete any non-stable duplicates by name
        const stableNames = new Set(
          all.filter((c) => c.id.startsWith('sys-cat-')).map((c) => c.name.toLowerCase())
        );
        const toDelete = all
          .filter((c) => !c.id.startsWith('sys-cat-') && stableNames.has(c.name.toLowerCase()))
          .map((c) => c.id);
        if (toDelete.length > 0) await tx.table('categories').bulkDelete(toDelete);
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
