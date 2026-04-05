// lib/categorisation/ai.ts — Client-side caller for the categorise API route

import type { Transaction, Category } from '@/lib/db/schema';
import type { CategoriseResult } from '@/app/api/categorise/route';

const BATCH_SIZE = 50;

export async function categoriseWithAI(
  transactions: Transaction[],
  categories: Category[]
): Promise<CategoriseResult[]> {
  if (transactions.length === 0) return [];

  const catPayload = categories.map((c) => ({ id: c.id, name: c.name, group: c.group }));
  const txPayload = transactions.map((t, i) => ({
    index: i,
    payee: t.payee,
    description: t.description,
    amount: t.amount,
  }));

  const res = await fetch('/api/categorise', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions: txPayload, categories: catPayload }),
  });

  if (!res.ok) {
    throw new Error(`AI categorisation request failed: ${res.status}`);
  }

  const data = await res.json();
  return (data.results ?? []) as CategoriseResult[];
}

export { BATCH_SIZE };
