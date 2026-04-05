// lib/categorisation/rules.ts — Rule-based matching engine

import type { CategorisationRule } from '@/lib/db/schema';

export interface RuleMatchResult {
  categoryId: string;
  confidence: 1.0;
  source: 'rule';
  ruleId: string;
}

/** Levenshtein distance — for fuzzy matching */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] =
        b[i - 1] === a[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Try to match a transaction against the rule list.
 * Rules must be passed in priority-descending order (highest priority first).
 */
export function matchRules(
  transaction: { payee: string; description: string },
  rules: CategorisationRule[]
): RuleMatchResult | null {
  for (const rule of rules) {
    const field =
      rule.matchField === 'payee' ? transaction.payee : transaction.description;
    const fieldLower = field.toLowerCase();
    const valueLower = rule.matchValue.toLowerCase();

    let matched = false;
    switch (rule.type) {
      case 'exact':
        matched = fieldLower === valueLower;
        break;
      case 'contains':
        matched = fieldLower.includes(valueLower);
        break;
      case 'fuzzy':
        matched = levenshtein(fieldLower, valueLower) <= 2;
        break;
      case 'regex':
        try {
          matched = new RegExp(rule.matchValue, 'i').test(field);
        } catch {
          matched = false;
        }
        break;
    }

    if (matched) {
      return { categoryId: rule.categoryId, confidence: 1.0, source: 'rule', ruleId: rule.id };
    }
  }
  return null;
}
