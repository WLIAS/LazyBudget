'use client';

import type { Transaction } from '@/lib/db/schema';
import { formatMoney } from '@/lib/utils/money';
import { formatDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils';

interface UploadPreviewProps {
  transactions: Omit<Transaction, 'id' | 'createdAt'>[];
  maxRows?: number;
}

export function UploadPreview({ transactions, maxRows = 20 }: UploadPreviewProps) {
  const preview = transactions.slice(0, maxRows);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-3 bg-muted/40 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium">Preview</h3>
        <span className="text-xs text-muted-foreground">
          Showing {preview.length} of {transactions.length} transactions
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Date</th>
              <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Payee</th>
              <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Description</th>
              <th className="text-right px-4 py-2 text-muted-foreground font-medium text-xs">Amount</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((tx, i) => (
              <tr
                key={i}
                className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
              >
                <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs whitespace-nowrap">
                  {tx.date}
                </td>
                <td className="px-4 py-2.5 max-w-[200px] truncate">{tx.payee}</td>
                <td className="px-4 py-2.5 max-w-[180px] truncate text-muted-foreground text-xs">
                  {tx.description}
                </td>
                <td
                  className={cn(
                    'px-4 py-2.5 text-right font-mono text-xs whitespace-nowrap',
                    tx.amount >= 0 ? 'amount-positive' : 'amount-negative'
                  )}
                >
                  {formatMoney(tx.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
