'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Upload, Wallet } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { LinkButton } from '@/components/ui/link-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDB } from '@/lib/db/index';
import { formatMoney } from '@/lib/utils/money';

const LABEL_COLOURS: Record<string, string> = {
  spending:   '#60A5FA',
  bills:      '#FBBF24',
  savings:    '#34D399',
  mortgage:   '#F87171',
  investment: '#A78BFA',
  other:      '#9CA3AF',
};

export default function AccountsPage() {
  const accounts = useLiveQuery(() => getDB().accounts.toArray());
  const transactions = useLiveQuery(() => getDB().transactions.toArray());

  const stats = useMemo(() => {
    if (!accounts || !transactions) return [];
    return accounts.map((acc) => {
      const txs = transactions.filter((t) => t.accountId === acc.id && !t.isTransfer);
      const inflow = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
      const outflow = txs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
      return { acc, inflow, outflow, count: txs.length };
    });
  }, [accounts, transactions]);

  const isEmpty = accounts !== undefined && accounts.length === 0;

  return (
    <PageShell title="Accounts" description="Account breakdown">
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <Wallet className="w-7 h-7 text-muted-foreground" />
          </div>
          <div>
            <h2 className="font-semibold">No accounts yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Accounts are created when you import your first bank statement.
            </p>
          </div>
          <LinkButton href="/upload" variant="outline" size="sm" className="gap-2">
            <Upload className="w-4 h-4" /> Upload statement
          </LinkButton>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
          {stats.map(({ acc, inflow, outflow, count }) => (
            <Card key={acc.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: LABEL_COLOURS[acc.label] ?? '#9CA3AF' }}
                  />
                  <CardTitle className="text-sm font-semibold truncate">{acc.name}</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground capitalize">{acc.label}{acc.bankName ? ` · ${acc.bankName}` : ''}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Inflow</span>
                  <span className="font-mono amount-positive">{formatMoney(inflow)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Outflow</span>
                  <span className="font-mono amount-negative">{formatMoney(outflow)}</span>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-border">
                  <span className="text-muted-foreground">Transactions</span>
                  <span className="font-mono text-foreground">{count.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
