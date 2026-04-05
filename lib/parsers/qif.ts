// lib/parsers/qif.ts — QIF file parser

export interface QIFEntry {
  date: string;     // raw date string from QIF
  amount: string;   // raw amount string
  payee: string;
  memo: string;
}

export function parseQIF(text: string): QIFEntry[] {
  const entries: QIFEntry[] = [];
  const blocks = text.split('^').map((b) => b.trim()).filter(Boolean);

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const entry: Partial<QIFEntry> = {};

    for (const line of lines) {
      const field = line[0];
      const value = line.slice(1).trim();

      switch (field) {
        case 'D': entry.date = value; break;
        case 'T': entry.amount = value.replace(/,/g, ''); break;
        case 'P': entry.payee = value; break;
        case 'M': entry.memo = value; break;
        // Skip: N (number), C (cleared), A (address), L (category), etc.
      }
    }

    if (entry.date && entry.amount !== undefined) {
      entries.push({
        date: entry.date,
        amount: entry.amount,
        payee: entry.payee ?? '',
        memo: entry.memo ?? '',
      });
    }
  }

  return entries;
}

export async function parseQIFFile(file: File): Promise<QIFEntry[]> {
  const text = await file.text();
  return parseQIF(text);
}
