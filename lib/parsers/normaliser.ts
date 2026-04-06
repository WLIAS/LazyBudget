// lib/parsers/normaliser.ts — Converts raw parsed rows to unified Transaction[]

import type { Transaction } from '@/lib/db/schema';
import type { RawRow } from './csv';
import type { QIFEntry } from './qif';
import type { BankProfile } from './bank-profiles';

function cleanPayee(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^\d{2,}[\s-]+/, '')             // strip leading account numbers
    .replace(/\*\s*/g, ' ')                   // normalise asterisks: UBER* EATS → UBER EATS
    .replace(/\.(COM|NET|ORG|CO)([A-Z])/g, '.$1 $2') // NETFLIX.COMLOS → NETFLIX.COM LOS
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseDate(raw: string, format?: string): string {
  const cleaned = raw.trim();

  // YYYY/MM/DD or YYYY-MM-DD
  if (/^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(cleaned)) {
    return cleaned.replace(/\//g, '-');
  }

  // DD/MM/YYYY or DD-MM-YYYY
  if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(cleaned)) {
    const [d, m, y] = cleaned.split(/[\/\-]/);
    return `${y}-${m}-${d}`;
  }

  // D/M/YYYY
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(cleaned)) {
    const [d, m, y] = cleaned.split(/[\/\-]/);
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // QIF format: MM/DD/YYYY or DD/MM/YY
  if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(cleaned)) {
    const [a, b, yy] = cleaned.split('/');
    const year = parseInt(yy) + 2000;
    // Assume DD/MM if day > 12, else try DD/MM
    const d = a.padStart(2, '0');
    const m = b.padStart(2, '0');
    return `${year}-${m}-${d}`;
  }

  // Fallback: try native Date parsing
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return cleaned;
}

function parseAmount(raw: string): number {
  const cleaned = raw
    .trim()
    .replace(/[$NZ\s]/g, '')
    .replace(/,/g, '');
  return parseFloat(cleaned) || 0;
}

export function normaliseCSVRows(
  rows: RawRow[],
  accountId: string,
  importBatchId: string,
  bankProfile?: BankProfile | null
): Omit<Transaction, 'id' | 'createdAt'>[] {
  return rows.map((row) => {
    const date = parseDate(row.date, bankProfile?.dateFormat);
    const amount = parseAmount(row.amount);
    const rawPayee = row.payee || row.description || 'Unknown';
    const payee = cleanPayee(rawPayee);

    return {
      date,
      amount,
      payee,
      rawPayee,
      description: row.description ?? '',
      categoryId: null,
      categorySource: null,
      confidence: 0,
      accountId,
      isTransfer: false,
      transferPairId: null,
      importBatchId,
    };
  });
}

export function normaliseQIFEntries(
  entries: QIFEntry[],
  accountId: string,
  importBatchId: string
): Omit<Transaction, 'id' | 'createdAt'>[] {
  return entries.map((entry) => {
    const date = parseDate(entry.date);
    const amount = parseAmount(entry.amount);
    const rawPayee = entry.payee || entry.memo || 'Unknown';
    const payee = cleanPayee(rawPayee);

    return {
      date,
      amount,
      payee,
      rawPayee,
      description: entry.memo ?? '',
      categoryId: null,
      categorySource: null,
      confidence: 0,
      accountId,
      isTransfer: false,
      transferPairId: null,
      importBatchId,
    };
  });
}
