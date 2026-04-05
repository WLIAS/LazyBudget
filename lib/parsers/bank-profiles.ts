// lib/parsers/bank-profiles.ts — Known NZ bank CSV column mappings

export interface BankProfile {
  name: string;
  /** Column header → schema field mapping */
  columns: {
    date: string;
    amount: string;
    payee?: string;
    description?: string;
    type?: string;
  };
  dateFormat: string;  // e.g. 'YYYY/MM/DD', 'DD/MM/YYYY'
  /** Header row contains these exact strings (used for auto-detection) */
  fingerprint: string[];
}

export const BANK_PROFILES: BankProfile[] = [
  {
    name: 'ASB',
    columns: {
      date: 'Date',
      amount: 'Amount',
      payee: 'Payee',
      description: 'Memo',
      type: 'Tran Type',
    },
    dateFormat: 'YYYY/MM/DD',
    fingerprint: ['Unique Id', 'Tran Type', 'Cheque Number', 'Payee', 'Memo'],
  },
  {
    name: 'ANZ',
    columns: {
      date: 'Date',
      amount: 'Amount',
      payee: 'Details',
      description: 'Particulars',
      type: 'Type',
    },
    dateFormat: 'DD/MM/YYYY',
    fingerprint: ['Type', 'Details', 'Particulars', 'Code', 'Reference', 'ForeignCurrencyAmount'],
  },
  {
    name: 'BNZ',
    columns: {
      date: 'Date',
      amount: 'Amount',
      payee: 'Payee',
      description: 'Memo',
    },
    dateFormat: 'DD/MM/YYYY',
    fingerprint: ['Account number', 'Date', 'Amount', 'Payee', 'Particulars'],
  },
  {
    name: 'Westpac',
    columns: {
      date: 'Date',
      amount: 'Amount',
      payee: 'Other Party',
      description: 'Details',
    },
    dateFormat: 'DD/MM/YYYY',
    fingerprint: ['Date', 'Amount', 'Other Party', 'Description', 'Reference', 'Particulars', 'Analysis Codes'],
  },
  {
    name: 'Kiwibank',
    columns: {
      date: 'Date',
      amount: 'Amount',
      payee: 'Description',
      description: 'Reference',
    },
    dateFormat: 'DD/MM/YYYY',
    fingerprint: ['Account', 'Date', 'Amount', 'Description', 'Reference', 'Balance'],
  },
];

/**
 * Detect bank from CSV headers. Returns the matching profile or null.
 */
export function detectBankProfile(headers: string[]): BankProfile | null {
  const headerSet = new Set(headers.map((h) => h.trim()));

  for (const profile of BANK_PROFILES) {
    const matches = profile.fingerprint.filter((f) => headerSet.has(f)).length;
    const score = matches / profile.fingerprint.length;
    if (score >= 0.6) return profile;
  }

  return null;
}

/** Keyword-based column auto-detection (generic fallback) */
export interface GenericMapping {
  date: string | null;
  amount: string | null;
  payee: string | null;
  description: string | null;
}

export function inferGenericMapping(headers: string[]): GenericMapping {
  const find = (keywords: string[]) =>
    headers.find((h) =>
      keywords.some((k) => h.toLowerCase().includes(k))
    ) ?? null;

  return {
    date: find(['date', 'transaction date', 'trans date', 'posted']),
    amount: find(['amount', 'debit', 'credit', 'value']),
    payee: find(['payee', 'merchant', 'vendor', 'name', 'party', 'details', 'description']),
    description: find(['memo', 'reference', 'note', 'particulars', 'narrative']),
  };
}
