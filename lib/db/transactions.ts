// lib/db/transactions.ts — Transaction CRUD

import { v4 as uuidv4 } from 'uuid';
import { getDB, type Transaction } from './index';

export async function addTransactions(
  transactions: Omit<Transaction, 'id' | 'createdAt'>[]
): Promise<{ added: number; skipped: number }> {
  const db = getDB();
  let added = 0;
  let skipped = 0;

  for (const tx of transactions) {
    // Duplicate detection: same date + amount + payee + accountId
    const existing = await db.transactions
      .where('date')
      .equals(tx.date)
      .and(
        (t) =>
          t.amount === tx.amount &&
          t.payee === tx.payee &&
          t.accountId === tx.accountId
      )
      .first();

    if (existing) {
      skipped++;
      continue;
    }

    await db.transactions.add({
      ...tx,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    });
    added++;
  }

  return { added, skipped };
}

export async function getTransactions(filters?: {
  accountId?: string;
  categoryId?: string | null;
  dateFrom?: string;
  dateTo?: string;
  isTransfer?: boolean;
}): Promise<Transaction[]> {
  const db = getDB();
  let query = db.transactions.orderBy('date').reverse();

  if (filters?.accountId) {
    query = db.transactions
      .where('accountId')
      .equals(filters.accountId)
      .reverse();
  }

  let results = await query.toArray();

  if (filters?.categoryId !== undefined) {
    results = results.filter((t) => t.categoryId === filters.categoryId);
  }
  if (filters?.dateFrom) {
    results = results.filter((t) => t.date >= filters.dateFrom!);
  }
  if (filters?.dateTo) {
    results = results.filter((t) => t.date <= filters.dateTo!);
  }
  if (filters?.isTransfer !== undefined) {
    results = results.filter((t) => t.isTransfer === filters.isTransfer);
  }

  return results;
}

export async function updateTransaction(
  id: string,
  changes: Partial<Transaction>
): Promise<void> {
  await getDB().transactions.update(id, changes);
}

export async function deleteTransaction(id: string): Promise<void> {
  await getDB().transactions.delete(id);
}

export async function deleteTransactionsByBatch(
  importBatchId: string
): Promise<void> {
  await getDB().transactions
    .where('importBatchId')
    .equals(importBatchId)
    .delete();
}

export async function getUncategorised(): Promise<Transaction[]> {
  const db = getDB();
  const all = await db.transactions.toArray();
  return all.filter(
    (t) =>
      !t.isTransfer &&
      (t.categoryId === null ||
        t.categoryId === 'uncategorised' ||
        t.confidence < 0.85)
  );
}

export async function bulkUpdateCategory(
  ids: string[],
  categoryId: string,
  source: Transaction['categorySource']
): Promise<void> {
  const db = getDB();
  await db.transactions.bulkPut(
    await Promise.all(
      ids.map(async (id) => {
        const t = await db.transactions.get(id);
        if (!t) throw new Error(`Transaction ${id} not found`);
        return { ...t, categoryId, categorySource: source, confidence: 1.0 };
      })
    )
  );
}
