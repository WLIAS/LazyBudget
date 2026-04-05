// lib/db/transactions.ts — Transaction CRUD

import { getDB, type Transaction } from './index';

/**
 * Deterministic transaction ID — FNV-1a hash of the four fields that
 * uniquely identify a bank transaction.  Re-uploading the same file
 * produces the same IDs → duplicates are silently skipped.
 */
export function makeTxId(
  date: string,
  amount: number,
  rawPayee: string,
  accountId: string
): string {
  const key = `${date}|${amount.toFixed(4)}|${rawPayee.trim().toLowerCase()}|${accountId}`;
  // Two independent FNV-1a passes → 16 hex chars (64-bit effective uniqueness)
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    h1 = (Math.imul(h1 ^ c, 0x01000193)) >>> 0;
    h2 = (Math.imul(h2 ^ (c * 31), 0x01000193)) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export async function addTransactions(
  transactions: Omit<Transaction, 'id' | 'createdAt'>[]
): Promise<{ added: number; skipped: number }> {
  if (transactions.length === 0) return { added: 0, skipped: 0 };

  const db = getDB();
  const now = new Date().toISOString();

  // Stamp every transaction with its deterministic ID
  const withIds: Transaction[] = transactions.map((tx) => ({
    ...tx,
    id: makeTxId(tx.date, tx.amount, tx.rawPayee, tx.accountId),
    createdAt: now,
  }));

  // Single bulk existence check — much faster than N individual queries
  const ids = withIds.map((t) => t.id);
  const existing = await db.transactions.bulkGet(ids);
  const existingIds = new Set(
    existing.filter(Boolean).map((t) => t!.id)
  );

  // Deduplicate within the batch too — two transactions in the same file
  // can share the same hash (same date + amount + payee on the same day).
  // Keep the first occurrence; subsequent ones count as skipped.
  const seenInBatch = new Set<string>();
  const toAdd = withIds.filter((t) => {
    if (existingIds.has(t.id) || seenInBatch.has(t.id)) return false;
    seenInBatch.add(t.id);
    return true;
  });

  if (toAdd.length > 0) {
    await db.transactions.bulkAdd(toAdd);
  }

  return { added: toAdd.length, skipped: withIds.length - toAdd.length };
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
