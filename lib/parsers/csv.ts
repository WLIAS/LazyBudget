// lib/parsers/csv.ts — CSV parser with bank auto-detection

import Papa from 'papaparse';
import { detectBankProfile, inferGenericMapping, type BankProfile } from './bank-profiles';

export interface RawRow {
  date: string;
  amount: string;
  payee: string;
  description: string;
}

export interface ParseResult {
  rows: RawRow[];
  bankProfile: BankProfile | null;
  headers: string[];
  isMappingGeneric: boolean;
  mapping: { date: string | null; amount: string | null; payee: string | null; description: string | null };
}

/**
 * Find the index of the first line that looks like a CSV header row.
 * Some banks (e.g. ASB) prepend several lines of account metadata before
 * the actual header. We scan up to the first 30 lines looking for a line
 * that contains "date" and ("amount" or "debit" or "credit").
 */
function findHeaderLineIndex(lines: string[]): number {
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const lower = lines[i].toLowerCase().replace(/"/g, '');
    if (
      lower.includes('date') &&
      (lower.includes('amount') ||
        lower.includes('debit') ||
        lower.includes('credit') ||
        lower.includes('value'))
    ) {
      return i;
    }
  }
  return 0; // fallback: assume first line is the header
}

export async function parseCSV(
  file: File,
  overrideMapping?: { date: string; amount: string; payee: string; description: string }
): Promise<ParseResult> {
  const rawText = await file.text();

  // Strip info lines that appear before the real CSV header
  const lines = rawText.split(/\r?\n/);
  const headerIdx = findHeaderLineIndex(lines);
  const text = lines.slice(headerIdx).join('\n');

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^"|"$/g, ''),
  });

  const headers = (parsed.meta.fields ?? []).filter(Boolean);
  const bankProfile = detectBankProfile(headers);
  const genericMapping = inferGenericMapping(headers);

  let mapping: { date: string | null; amount: string | null; payee: string | null; description: string | null };
  let isMappingGeneric = false;

  if (overrideMapping) {
    mapping = overrideMapping;
  } else if (bankProfile) {
    mapping = {
      date:        bankProfile.columns.date,
      amount:      bankProfile.columns.amount,
      payee:       bankProfile.columns.payee ?? null,
      description: bankProfile.columns.description ?? null,
    };
  } else {
    mapping = genericMapping;
    isMappingGeneric = true;
  }

  const rows: RawRow[] = [];

  for (const row of parsed.data) {
    const date      = mapping.date        ? (row[mapping.date]        ?? '').trim() : '';
    const rawAmount = mapping.amount      ? (row[mapping.amount]      ?? '').trim() : '';
    const payee     = mapping.payee       ? (row[mapping.payee]       ?? '').trim() : '';
    const desc      = mapping.description ? (row[mapping.description] ?? '').trim() : '';

    if (!date || !rawAmount) continue;

    rows.push({ date, amount: rawAmount, payee, description: desc });
  }

  return { rows, bankProfile, headers, isMappingGeneric, mapping };
}
