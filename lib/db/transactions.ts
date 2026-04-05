// lib/db/transactions.ts — Transaction CRUD

import { getDB, type Transaction } from './index';

/**
 * Deterministic transaction ID — FNV-1a hash of the key fields plus
 * a sequence number. The sequence number distinguishes genuinely
 * identical transactions within the same file (same merchant, same
 * amount, same day) while still deduplicating re-imports of the
 * same file (same order → same seq → same ID).
 */
export function makeTxId(
  date: string,
  amount: number,
  rawPayee: string,
  accountId: string,
  seq = 0
): string {
  const key = `${date}|${amount.toFixed(4)}|${rawPayee.trim().toLowerCase()}|${accountId}|${seq}`;
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

  // Assign deterministic IDs — identical transactions within the same
  // batch get incrementing seq numbers so they are kept as distinct rows.
  // Re-uploading the same file in the same order yields the same seq
  // values → same IDs → recognised as duplicates by the bulkGet below.
  const baseKeySeq = new Map<string, number>();
  const withIds: Transaction[] = transactions.map((tx) => {
    const baseKey = `${tx.date}|${tx.amount.toFixed(4)}|${tx.rawPayee.trim().toLowerCase()}|${tx.accountId}`;
    const seq = baseKeySeq.get(baseKey) ?? 0;
    baseKeySeq.set(baseKey, seq + 1);
    return {
      ...tx,
      id: makeTxId(tx.date, tx.amount, tx.rawPayee, tx.accountId, seq),
      createdAt: now,
    };
  });

  // Single bulk existence check — much faster than N individual queries
  const ids = withIds.map((t) => t.id);
  const existing = await db.transactions.bulkGet(ids);
  const existingIds = new Set(existing.filter(Boolean).map((t) => t!.id));

  const toAdd = withIds.filter((t) => !existingIds.has(t.id));
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
