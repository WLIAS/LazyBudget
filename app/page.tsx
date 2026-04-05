'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { Upload, AlertCircle, ArrowRight, TrendingUp, DollarSign, List } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { StatCard } from '@/components/dashboard/stat-card';
import { LinkButton } from '@/components/ui/link-button';
import { CategoryBadge } from '@/components/transactions/category-badge';
import { getDB } from '@/lib/db/index';
import { formatMoney } from '@/lib/utils/money';
import { formatDateShort } from '@/lib/utils/dates';
import { useAppStore } from '@/lib/store/app-store';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { dateRange } = useAppStore();

  const transactions = useLiveQuery(() =>
    getDB().transactions.orderBy('date').reverse().toArray()
  );
  const categories = useLiveQuery(() => getDB().categories.toArray());
  const accounts = useLiveQuery(() => getDB().accounts.toArray());

  const categoryMap = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c])),
    [categories]
  );

  // Stats scoped to selected date range
  const rangeTransactions = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(
      (t) => !t.isTransfer && t.date >= dateRange.from && t.date <= dateRange.to
    );
  }, [transactions, dateRange]);

  const totalSpend = useMemo(
    () => rangeTransactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0),
    [rangeTransactions]
  );

  const totalIncome = useMemo(
    () => rangeTransactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    [rangeTransactions]
  );

  const uncategorisedCount = useMemo(
    () => (transactions ?? []).filter((t) => !t.isTransfer && !t.categoryId).length,
    [transactions]
  );

  const recentTxs = useMemo(() => (transactions ?? []).slice(0, 10), [transactions]);

  const isEmpty = transactions !== undefined && transactions.length === 0;

  return (
    <PageShell title="Dashboard" description="Your financial overview">
      <div className="space-y-6">
        {isEmpty ? (
          /* ── Empty state ── */
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <DollarSign className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">No data yet</h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                Import your first bank statement to see spending insights and savings analysis.
              </p>
            </div>
            <LinkButton href="/upload" className="gap-2">
              <Upload className="w-4 h-4" /> Upload bank statement
            </LinkButton>
          </div>
        ) : (
          <>
            {/* ── Stat cards ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label="Spent this period"
                value={transactions ? formatMoney(Math.abs(totalSpend)) : '—'}
                sub={`${rangeTransactions.filter(t => t.amount < 0).length} transactions`}
                icon={DollarSign}
                valueClass="amount-negative"
              />
              <StatCard
                label="Income this period"
                value={transactions ? formatMoney(totalIncome) : '—'}
                sub={`${rangeTransactions.filter(t => t.amount > 0).length} transactions`}
                icon={TrendingUp}
                valueClass="amount-positive"
              />
              <StatCard
                label="Needs review"
                value={transactions ? String(uncategorisedCount) : '—'}
                sub="uncategorised transactions"
                icon={AlertCircle}
                valueClass={uncategorisedCount > 0 ? 'text-[#FBBF24]' : undefined}
              />
            </div>

            {/* ── Quick actions ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link href="/upload" className="group flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-3">
                  <Upload className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Upload statement</p>
                    <p className="text-xs text-muted-foreground">CSV or QIF from any NZ bank</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Link>
              <Link href="/review" className="group flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-[#FBBF24]" />
                  <div>
                    <p className="text-sm font-medium">Review queue</p>
                    <p className="text-xs text-muted-foreground">
                      {uncategorisedCount > 0
                        ? `${uncategorisedCount} transactions need categorising`
                        : 'All transactions categorised'}
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Link>
            </div>

            {/* ── Recent transactions ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Recent transactions</h2>
                <Link href="/transactions" className="text-xs text-primary hover:underline flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                {recentTxs.map((tx, i) => {
                  const category = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
                  return (
                    <div
                      key={tx.id}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors',
                        i < recentTxs.length - 1 && 'border-b border-border/50'
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{tx.payee || tx.rawPayee}</p>
                        <p className="text-xs text-muted-foreground font-mono">{formatDateShort(tx.date)}</p>
                      </div>
                      <CategoryBadge category={category} className="hidden sm:inline-flex" />
                      <span className={cn(
                        'font-mono text-sm font-medium whitespace-nowrap',
                        tx.amount >= 0 ? 'amount-positive' : 'amount-negative'
                      )}>
                        {formatMoney(tx.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
