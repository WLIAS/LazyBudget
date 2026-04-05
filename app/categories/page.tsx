'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Upload } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { LinkButton } from '@/components/ui/link-button';
import { getDB } from '@/lib/db/index';
import { formatMoney } from '@/lib/utils/money';
import { useAppStore } from '@/lib/store/app-store';
import { cn } from '@/lib/utils';

export default function CategoriesPage() {
  const { dateRange } = useAppStore();

  const transactions = useLiveQuery(() =>
    getDB().transactions.orderBy('date').reverse().toArray()
  );
  const categories = useLiveQuery(() => getDB().categories.toArray());

  const categoryMap = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c])),
    [categories]
  );

  // Group spend (debits only, no transfers) by category in date range
  const grouped = useMemo(() => {
    if (!transactions || !categories) return [];

    const inRange = transactions.filter(
      (t) =>
        !t.isTransfer &&
        t.amount < 0 &&
        t.date >= dateRange.from &&
        t.date <= dateRange.to
    );

    const totals = new Map<string, number>();
    const counts = new Map<string, number>();

    for (const tx of inRange) {
      const key = tx.categoryId ?? '__uncategorised__';
      totals.set(key, (totals.get(key) ?? 0) + Math.abs(tx.amount));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const rows = [...totals.entries()]
      .map(([id, total]) => ({
        id,
        category: id === '__uncategorised__' ? null : categoryMap.get(id),
        name: id === '__uncategorised__'
          ? 'Uncategorised'
          : (categoryMap.get(id)?.name ?? id),
        group: id === '__uncategorised__'
          ? 'Other'
          : (categoryMap.get(id)?.group ?? ''),
        colour: id === '__uncategorised__'
          ? '#6B7280'
          : (categoryMap.get(id)?.colour ?? '#6B7280'),
        total,
        count: counts.get(id) ?? 0,
      }))
      .sort((a, b) => b.total - a.total);

    return rows;
  }, [transactions, categories, categoryMap, dateRange]);

  const grandTotal = useMemo(
    () => grouped.reduce((s, r) => s + r.total, 0),
    [grouped]
  );

  const isEmpty = transactions !== undefined && transactions.length === 0;

  return (
    <PageShell title="Categories" description="Spending breakdown by category">
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <p className="text-muted-foreground text-sm">No data yet.</p>
          <LinkButton href="/upload" variant="outline" size="sm" className="gap-2">
            <Upload className="w-4 h-4" /> Upload statement
          </LinkButton>
        </div>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8">No spending in this period.</p>
      ) : (
        <div className="space-y-2 max-w-2xl">
          {grouped.map((row) => {
            const pct = grandTotal > 0 ? (row.total / grandTotal) * 100 : 0;
            return (
              <div key={row.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: row.colour }}
                    />
                    <span className="text-sm font-medium truncate">{row.name}</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {row.group}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-medium amount-negative">
                      {formatMoney(row.total)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.count} txn{row.count !== 1 ? 's' : ''} · {pct.toFixed(1)}%
                    </p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: row.colour }}
                  />
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between pt-2 px-1 text-sm font-medium">
            <span className="text-muted-foreground">Total spend</span>
            <span className="font-mono amount-negative">{formatMoney(grandTotal)}</span>
          </div>
        </div>
      )}
    </PageShell>
  );
}
