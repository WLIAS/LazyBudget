// lib/db/rules.ts — CategorisationRule CRUD

import { v4 as uuidv4 } from 'uuid';
import { getDB, type CategorisationRule } from './index';

export async function createRule(
  data: Omit<CategorisationRule, 'id' | 'createdAt' | 'hitCount'>
): Promise<CategorisationRule> {
  const db = getDB();
  // Check for duplicate
  const existing = await db.rules
    .where('matchValue')
    .equals(data.matchValue)
    .and(
      (r) =>
        r.matchField === data.matchField &&
        r.categoryId === data.categoryId &&
        r.type === data.type
    )
    .first();
  if (existing) return existing;

  const rule: CategorisationRule = {
    ...data,
    id: uuidv4(),
    hitCount: 0,
    createdAt: new Date().toISOString(),
  };
  await db.rules.add(rule);
  return rule;
}

export async function getRules(): Promise<CategorisationRule[]> {
  return getDB().rules.orderBy('priority').reverse().toArray();
}

export async function updateRule(
  id: string,
  changes: Partial<CategorisationRule>
): Promise<void> {
  await getDB().rules.update(id, changes);
}

export async function deleteRule(id: string): Promise<void> {
  await getDB().rules.delete(id);
}

export async function incrementRuleHitCount(id: string): Promise<void> {
  const rule = await getDB().rules.get(id);
  if (rule) {
    await getDB().rules.update(id, { hitCount: rule.hitCount + 1 });
  }
}
