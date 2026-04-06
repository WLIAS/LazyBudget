// lib/analytics/transfers.ts — Amount-based transfer detection across accounts

import { getDB } from '@/lib/db/index';
import { updateTransaction } from '@/lib/db/transactions';
import type { Transaction } from '@/lib/db/schema';

export interface TransferPair {
  debit: Transaction;   // amount < 0
  credit: Transaction;  // amount > 0
  confidence: number;   // 0–1
  daysDiff: number;     // 0, 1, or 2
}

export interface DetectionResult {
  newPairs: TransferPair[];
  skipped: number; // already-paired transactions not re-scanned
}

const TRANSFER_HINT_KEYWORDS = [
  'transfer', ' tfr', 'trf', 'to savings', 'to account',
  'internet banking', 'own account', 'to anz', 'to asb', 'to bnz',
  'to westpac', 'to kiwibank', 'to tsb',
];

function hasTransferHint(tx: Transaction): boolean {
  const text = `${tx.payee} ${tx.description}`.toLowerCase();
  return TRANSFER_HINT_KEYWORDS.some((kw) => text.includes(kw));
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00').getTime();
  const db_date = new Date(b + 'T00:00:00').getTime();
  return Math.abs(da - db_date) / 86_400_000;
}

function scorePair(debit: Transaction, credit: Transaction): number {
  const days = daysBetween(debit.date, credit.date);
  if (days > 2) return 0;

  // Base score from date proximity
  const proximity = days === 0 ? 1.0 : days === 1 ? 0.7 : 0.4;

  // Bonus if either side has a transfer keyword
  const hintBonus = hasTransferHint(debit) || hasTransferHint(credit) ? 0.2 : 0;

  return Math.min(1.0, proximity + hintBonus);
}

/**
 * Scan all transactions across accounts and find debit/credit pairs of the
 * same absolute amount in different accounts within ±2 days.
 *
 * Already-paired transactions (transferPairId !== null) are excluded from
 * scanning so re-running detection doesn't create duplicate pairings.
 */
export async function detectTransferPairs(): Promise<DetectionResult> {
  const db = getDB();
  const all = await db.transactions.toArray();

  // Separate already-paired from candidates
  const alreadyPaired = all.filter((t) => t.transferPairId !== null);
  const candidates = all.filter((t) => t.transferPairId === null);

  const debits = candidates.filter((t) => t.amount < 0);
  const credits = candidates.filter((t) => t.amount > 0);

  const newPairs: TransferPair[] = [];
  const usedIds = new Set<string>();

  for (const debit of debits) {
    if (usedIds.has(debit.id)) continue;

    // Find credits: same absolute amount, different account, within ±2 days
    const eligible = credits.filter((c) => {
      if (usedIds.has(c.id)) return false;
      if (c.accountId === debit.accountId) return false;
      if (Math.abs(Math.abs(debit.amount) - c.amount) > 0.005) return false;
      return daysBetween(debit.date, c.date) <= 2;
    });

    if (eligible.length === 0) continue;

    // Pick the highest-scoring candidate
    let bestScore = 0;
    let best: Transaction | null = null;

    for (const c of eligible) {
      const s = scorePair(debit, c);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }

    // Minimum confidence 0.4 (same amount, same-or-adjacent day, different account)
    if (best && bestScore >= 0.4) {
      newPairs.push({
        debit,
        credit: best,
        confidence: bestScore,
        daysDiff: daysBetween(debit.date, best.date),
      });
      usedIds.add(debit.id);
      usedIds.add(best.id);
    }
  }

  return { newPairs, skipped: alreadyPaired.length };
}

/**
 * Write detected pairs to the DB: set isTransfer, transferPairId, and
 * assign the Internal Transfer category on both sides.
 */
export async function applyTransferPairs(pairs: TransferPair[]): Promise<number> {
  if (pairs.length === 0) return 0;

  const db = getDB();
  const internalTransferCat = await db.categories
    .filter((c) => c.name === 'Internal Transfer')
    .first();

  let updated = 0;

  for (const pair of pairs) {
    // Use the debit ID as the stable pair identifier
    const pairId = pair.debit.id;

    await Promise.all([
      updateTransaction(pair.debit.id, {
        isTransfer: true,
        transferPairId: pairId,
        categoryId: internalTransferCat?.id ?? null,
        categorySource: 'rule',
        confidence: pair.confidence,
      }),
      updateTransaction(pair.credit.id, {
        isTransfer: true,
        transferPairId: pairId,
        categoryId: internalTransferCat?.id ?? null,
        categorySource: 'rule',
        confidence: pair.confidence,
      }),
    ]);

    updated += 2;
  }

  return updated;
}

/**
 * Remove a transfer pairing from both sides of a pair. The transaction will
 * land back in the review queue as uncategorised.
 */
export async function unflagTransferPair(transactionId: string): Promise<void> {
  const db = getDB();
  const tx = await db.transactions.get(transactionId);
  if (!tx) return;

  const pairId = tx.transferPairId;

  await updateTransaction(transactionId, {
    isTransfer: false,
    transferPairId: null,
    categoryId: null,
    categorySource: null,
    confidence: 0,
  });

  if (pairId) {
    // Find the other side by transferPairId (table scan — small dataset, fine)
    const all = await db.transactions.toArray();
    const partner = all.find(
      (t) => t.transferPairId === pairId && t.id !== transactionId
    );
    if (partner) {
      await updateTransaction(partner.id, {
        isTransfer: false,
        transferPairId: null,
        categoryId: null,
        categorySource: null,
        confidence: 0,
      });
    }
  }
}

/**
 * Fetch all currently confirmed transfer pairs from the DB.
 * Returns an array of { debit, credit } pairs (deduplicated by pairId).
 */
export async function getConfirmedTransferPairs(): Promise<Array<{ debit: Transaction; credit: Transaction }>> {
  const db = getDB();
  const all = await db.transactions.toArray();

  const paired = all.filter((t) => t.transferPairId !== null);
  const byPairId = new Map<string, Transaction[]>();

  for (const t of paired) {
    const pid = t.transferPairId!;
    if (!byPairId.has(pid)) byPairId.set(pid, []);
    byPairId.get(pid)!.push(t);
  }

  const result: Array<{ debit: Transaction; credit: Transaction }> = [];

  for (const [, pair] of byPairId) {
    const debit = pair.find((t) => t.amount < 0);
    const credit = pair.find((t) => t.amount > 0);
    if (debit && credit) {
      result.push({ debit, credit });
    }
  }

  // Sort newest first
  result.sort((a, b) => b.debit.date.localeCompare(a.debit.date));

  return result;
}
