// lib/db/schema.ts — Dexie DB types & schema definition

export interface Transaction {
  id: string;
  date: string;                         // ISO date YYYY-MM-DD
  amount: number;                       // Negative = debit, positive = credit
  payee: string;                        // Cleaned payee name
  rawPayee: string;                     // Original from bank
  description: string;                  // Memo / reference
  categoryId: string | null;
  categorySource: 'rule' | 'ai' | 'user' | null;
  confidence: number;                   // 0–1
  accountId: string;
  isTransfer: boolean;
  transferPairId: string | null;
  importBatchId: string;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  label: 'spending' | 'bills' | 'savings' | 'mortgage' | 'investment' | 'other';
  bankName: string;
  currency: string;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  group: string;
  icon: string;
  colour: string;
  isSystem: boolean;
}

export interface CategorisationRule {
  id: string;
  type: 'exact' | 'contains' | 'fuzzy' | 'regex';
  matchField: 'payee' | 'description';
  matchValue: string;
  categoryId: string;
  priority: number;
  createdBy: 'user' | 'system' | 'ai';
  hitCount: number;
  createdAt: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  amount: number;
  period: 'monthly';
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface ImportBatch {
  id: string;
  fileName: string;
  accountId: string;
  transactionCount: number;
  dateRange: { from: string; to: string };
  importedAt: string;
}
