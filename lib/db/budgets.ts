// lib/db/budgets.ts — Budget CRUD

import { v4 as uuidv4 } from 'uuid';
import { getDB, type Budget } from './index';

export async function setBudget(
  categoryId: string,
  amount: number,
  effectiveFrom?: string
): Promise<Budget> {
  const db = getDB();
  const from = effectiveFrom ?? new Date().toISOString().slice(0, 7) + '-01';

  // Close existing open budget for this category
  const existing = await db.budgets
    .where('categoryId')
    .equals(categoryId)
    .and((b) => b.effectiveTo === null)
    .first();
  if (existing) {
    await db.budgets.update(existing.id, { effectiveTo: from });
  }

  const budget: Budget = {
    id: uuidv4(),
    categoryId,
    amount,
    period: 'monthly',
    effectiveFrom: from,
    effectiveTo: null,
  };
  await db.budgets.add(budget);
  return budget;
}

export async function getBudgets(asOf?: string): Promise<Budget[]> {
  const date = asOf ?? new Date().toISOString().slice(0, 10);
  const all = await getDB().budgets.toArray();
  return all.filter(
    (b) =>
      b.effectiveFrom <= date &&
      (b.effectiveTo === null || b.effectiveTo > date)
  );
}

export async function deleteBudget(id: string): Promise<void> {
  await getDB().budgets.delete(id);
}
