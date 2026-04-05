// lib/categorisation/merchant-mappings.ts
// Source of truth: merchant-mappings.csv — edit that file, this module reads it at runtime.
// Only import this module from server-side code (API routes).

import { readFileSync } from 'fs';
import { join } from 'path';

export interface MerchantMapping {
  keyword: string;
  category: string;
  subcategory: string;
}

function loadFromCSV(): MerchantMapping[] {
  const csv = readFileSync(
    join(process.cwd(), 'lib/categorisation/merchant-mappings.csv'),
    'utf-8'
  );
  return csv
    .trim()
    .split('\n')
    .slice(1) // skip header row
    .filter((line) => line.trim())
    .map((line) => {
      const commaIdx = line.indexOf(',');
      const rest = line.slice(commaIdx + 1);
      const commaIdx2 = rest.indexOf(',');
      return {
        keyword:     line.slice(0, commaIdx).trim(),
        category:    rest.slice(0, commaIdx2).trim(),
        subcategory: rest.slice(commaIdx2 + 1).trim(),
      };
    });
}

/** All merchant keyword mappings, loaded from merchant-mappings.csv. */
export const MERCHANT_MAPPINGS: MerchantMapping[] = loadFromCSV();

/** Build a grouped merchant hint string for injection into AI prompts. */
export function buildMerchantHints(): string {
  const grouped = new Map<string, string[]>();
  for (const m of MERCHANT_MAPPINGS) {
    const key = `${m.category} › ${m.subcategory}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(m.keyword);
  }
  return [...grouped.entries()]
    .map(([label, keywords]) => `${label}: ${keywords.join(', ')}`)
    .join('\n');
}
