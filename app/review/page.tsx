'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Upload } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { LinkButton } from '@/components/ui/link-button';
import { getDB } from '@/lib/db/index';
import { formatMoney } from '@/lib/utils/money';
import { formatDateShort } from '@/lib/utils/dates';
import { cn } from '@/lib/utils';

export default function ReviewPage() {
  const transactions = useLiveQuery(() =>
    getDB().transactions
      .orderBy('date')
      .reverse()
      .filter((t) => !t.isTransfer && !t.categoryId)
      .toArray()
  );

  const isEmpty = transactions !== undefined && transactions.length === 0;
  const hasData = transactions !== undefined && transactions.length > 0;

  return (
    <PageShell
      title="Review"
      description={
        transactions
          ? `${transactions.length.toLocaleString()} uncategorised transactions`
          : 'Loading…'
      }
    >
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <CheckCircle2 className="w-12 h-12 text-[#34D399]" />
          <div>
            <h2 className="font-semibold">All caught up!</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              All transactions are categorised — or import more data.
            </p>
          </div>
          <LinkButton href="/upload" variant="outline" size="sm" className="gap-2">
            <Upload className="w-4 h-4" /> Import more
          </LinkButton>
        </div>
      ) : hasData ? (
        <div className="max-w-2xl space-y-2">
          <p className="text-sm text-muted-foreground mb-4">
            These transactions have no category. AI categorisation (Phase 2) will fill these in automatically.
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            {transactions.map((tx, i) => (
              <div
                key={tx.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors',
                  i < transactions.length - 1 && 'border-b border-border/50'
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{tx.payee || tx.rawPayee}</p>
                  <p className="text-xs text-muted-foreground">{formatDateShort(tx.date)}{tx.description ? ` · ${tx.description}` : ''}</p>
                </div>
                <span className={cn(
                  'font-mono text-sm font-medium whitespace-nowrap',
                  tx.amount >= 0 ? 'amount-positive' : 'amount-negative'
                )}>
                  {formatMoney(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-8">Loading…</p>
      )}
    </PageShell>
  );
}
