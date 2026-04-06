// lib/categorisation/engine.ts — Categorisation orchestrator: rules → AI → review queue

import { getRules, incrementRuleHitCount } from '@/lib/db/rules';
import { getCategories } from '@/lib/db/categories';
import { getTransactions, updateTransaction } from '@/lib/db/transactions';
import { matchRules } from './rules';
import { categoriseWithAI, BATCH_SIZE } from './ai';
import type { Transaction } from '@/lib/db/schema';

export interface EngineProgress {
  phase: 'rules' | 'ai' | 'done';
  done: number;
  total: number;
}

export interface EngineResult {
  ruleMatched: number;
  aiCategorised: number;
  needsReview: number;
  transfers: number;
  errors: number;
}

const TRANSFER_KEYWORDS = [
  'transfer', ' tfr', 'trf ', 'trf-', 'to savings', 'to account',
  'internet banking', 'own account', 'to anz', 'to asb', 'to bnz',
  'to westpac', 'to kiwibank', 'to tsb',
];

function looksLikeTransfer(tx: Transaction): boolean {
  const text = `${tx.payee} ${tx.description}`.toLowerCase();
  return TRANSFER_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * Run the full categorisation pipeline on a set of transactions.
 * Mutates transactions in the DB directly.
 */
export async function runCategorisation(
  importBatchId: string,
  onProgress?: (p: EngineProgress) => void
): Promise<EngineResult> {
  // Load everything we need
  const [rules, categories, allTxs] = await Promise.all([
    getRules(),
    getCategories(),
    getTransactions({ isTransfer: false }),
  ]);

  // Only process transactions from this import batch that have no category yet
  const txs = allTxs.filter(
    (t) => t.importBatchId === importBatchId && !t.categoryId
  );

  const total = txs.length;
  let done = 0;

  const result: EngineResult = {
    ruleMatched: 0,
    aiCategorised: 0,
    needsReview: 0,
    transfers: 0,
    errors: 0,
  };

  if (total === 0) return result;

  onProgress?.({ phase: 'rules', done: 0, total });

  // ── Phase 1: Transfer detection ────────────────────────────────────────────
  const transferIds = new Set<string>();
  const internalTransferCat = categories.find((c) => c.name === 'Internal Transfer');

  for (const tx of txs) {
    if (looksLikeTransfer(tx)) {
      transferIds.add(tx.id);
      await updateTransaction(tx.id, {
        isTransfer: true,
        categoryId: internalTransferCat?.id ?? null,
        categorySource: 'rule',
        confidence: 0.9,
      });
      result.transfers++;
      done++;
    }
  }

  const remaining = txs.filter((t) => !transferIds.has(t.id));

  // ── Phase 2: Rule matching ─────────────────────────────────────────────────
  const needsAI: Transaction[] = [];

  onProgress?.({ phase: 'rules', done, total });

  for (const tx of remaining) {
    const match = matchRules(tx, rules);
    if (match) {
      await updateTransaction(tx.id, {
        categoryId: match.categoryId,
        categorySource: 'rule',
        confidence: 1.0,
      });
      await incrementRuleHitCount(match.ruleId);
      result.ruleMatched++;
      done++;
      onProgress?.({ phase: 'rules', done, total });
    } else {
      needsAI.push(tx);
      // don't count here — Phase 3 will increment done as batches complete
    }
  }

  // ── Phase 3: AI categorisation in batches of 50 ───────────────────────────
  onProgress?.({ phase: 'ai', done, total });

  for (let i = 0; i < needsAI.length; i += BATCH_SIZE) {
    const batch = needsAI.slice(i, i + BATCH_SIZE);

    try {
      const aiResults = await categoriseWithAI(batch, categories);

      for (const r of aiResults) {
        const tx = batch[r.index];
        if (!tx) continue;

        // Validate categoryId is real
        const validCat = categories.find((c) => c.id === r.categoryId);
        if (!validCat) continue;

        if (r.confidence >= 0.75) {
          await updateTransaction(tx.id, {
            categoryId: r.categoryId,
            categorySource: 'ai',
            confidence: r.confidence,
          });
          result.aiCategorised++;
        } else {
          // Low confidence — leave uncategorised so it lands in the review queue
          result.needsReview++;
        }
      }

      // Any batch items not returned by AI go to review queue
      const returnedIndexes = new Set(aiResults.map((r) => r.index));
      for (let j = 0; j < batch.length; j++) {
        if (!returnedIndexes.has(j)) result.needsReview++;
      }
    } catch (e) {
      console.error('[engine] AI batch failed:', e);
      result.errors++;
      result.needsReview += batch.length;
    }

    done += batch.length;
    onProgress?.({ phase: 'ai', done, total });
  }

  onProgress?.({ phase: 'done', done: total, total });
  return result;
}

/**
 * Run the categorisation pipeline on all currently uncategorised (non-transfer)
 * transactions. Unlike runCategorisation, this is not scoped to an import batch
 * and is suitable for triggering from the UI on demand.
 */
export async function reclassifyUncategorised(
  onProgress?: (p: EngineProgress) => void
): Promise<EngineResult> {
  const [rules, categories, allTxs] = await Promise.all([
    getRules(),
    getCategories(),
    getTransactions({ isTransfer: false }),
  ]);

  const txs = allTxs.filter((t) => !t.categoryId);
  const total = txs.length;
  let done = 0;

  const result: EngineResult = {
    ruleMatched: 0,
    aiCategorised: 0,
    needsReview: 0,
    transfers: 0,
    errors: 0,
  };

  if (total === 0) return result;

  onProgress?.({ phase: 'rules', done: 0, total });

  // ── Phase 1: Rule matching ─────────────────────────────────────────────────
  const needsAI: Transaction[] = [];

  for (const tx of txs) {
    const match = matchRules(tx, rules);
    if (match) {
      await updateTransaction(tx.id, {
        categoryId: match.categoryId,
        categorySource: 'rule',
        confidence: 1.0,
      });
      await incrementRuleHitCount(match.ruleId);
      result.ruleMatched++;
      done++;
      onProgress?.({ phase: 'rules', done, total });
    } else {
      needsAI.push(tx);
    }
  }

  // ── Phase 2: AI categorisation in batches ─────────────────────────────────
  onProgress?.({ phase: 'ai', done, total });

  for (let i = 0; i < needsAI.length; i += BATCH_SIZE) {
    const batch = needsAI.slice(i, i + BATCH_SIZE);

    try {
      const aiResults = await categoriseWithAI(batch, categories);

      for (const r of aiResults) {
        const tx = batch[r.index];
        if (!tx) continue;
        const validCat = categories.find((c) => c.id === r.categoryId);
        if (!validCat) continue;

        if (r.confidence >= 0.75) {
          await updateTransaction(tx.id, {
            categoryId: r.categoryId,
            categorySource: 'ai',
            confidence: r.confidence,
          });
          result.aiCategorised++;
        } else {
          result.needsReview++;
        }
      }

      const returnedIndexes = new Set(aiResults.map((r) => r.index));
      for (let j = 0; j < batch.length; j++) {
        if (!returnedIndexes.has(j)) result.needsReview++;
      }
    } catch (e) {
      console.error('[engine] AI reclassify batch failed:', e);
      result.errors++;
      result.needsReview += batch.length;
    }

    done += batch.length;
    onProgress?.({ phase: 'ai', done, total });
  }

  onProgress?.({ phase: 'done', done: total, total });
  return result;
}

/**
 * Reprocess all transactions matching a specific payee with a new rule.
 * Called from the review queue when a user creates a rule.
 */
export async function applyRuleToExisting(
  matchField: 'payee' | 'description',
  matchValue: string,
  categoryId: string
): Promise<number> {
  const allTxs = await getTransactions();
  const lower = matchValue.toLowerCase();
  const matches = allTxs.filter((t) => {
    const field = (matchField === 'payee' ? t.payee : t.description).toLowerCase();
    return field === lower || field.includes(lower);
  });

  await Promise.all(
    matches.map((t) =>
      updateTransaction(t.id, {
        categoryId,
        categorySource: 'rule',
        confidence: 1.0,
      })
    )
  );

  return matches.length;
}
