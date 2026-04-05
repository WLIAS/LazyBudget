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
  /** true if mapping was inferred rather than from a known profile */
  isMappingGeneric: boolean;
  /** mapping used — lets UI show column mapper when needed */
  mapping: { date: string | null; amount: string | null; payee: string | null; description: string | null };
}

export async function parseCSV(
  file: File,
  overrideMapping?: { date: string; amount: string; payee: string; description: string }
): Promise<ParseResult> {
  const text = await file.text();

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const bankProfile = detectBankProfile(headers);
  const genericMapping = inferGenericMapping(headers);

  let mapping: { date: string | null; amount: string | null; payee: string | null; description: string | null };
  let isMappingGeneric = false;

  if (overrideMapping) {
    mapping = overrideMapping;
  } else if (bankProfile) {
    mapping = {
      date: bankProfile.columns.date,
      amount: bankProfile.columns.amount,
      payee: bankProfile.columns.payee ?? null,
      description: bankProfile.columns.description ?? null,
    };
  } else {
    mapping = genericMapping;
    isMappingGeneric = true;
  }

  const rows: RawRow[] = [];

  for (const row of parsed.data) {
    const date = mapping.date ? row[mapping.date] ?? '' : '';
    const rawAmount = mapping.amount ? row[mapping.amount] ?? '' : '';
    const payee = mapping.payee ? row[mapping.payee] ?? '' : '';
    const description = mapping.description ? row[mapping.description] ?? '' : '';

    if (!date || !rawAmount) continue;

    rows.push({
      date: date.trim(),
      amount: rawAmount.trim(),
      payee: payee.trim(),
      description: description.trim(),
    });
  }

  return { rows, bankProfile, headers, isMappingGeneric, mapping };
}
