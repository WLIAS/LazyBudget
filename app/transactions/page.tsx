'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Upload } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { TransactionTable } from '@/components/transactions/transaction-table';
import { LinkButton } from '@/components/ui/link-button';
import { Input } from '@/components/ui/input';
import { getDB } from '@/lib/db/index';
import { useAppStore } from '@/lib/store/app-store';
import { cn } from '@/lib/utils';

type TypeFilter = 'all' | 'debit' | 'credit';

export default function TransactionsPage() {
  const [search, setSearch]           = useState('');
  const [categoryId, setCategoryId]   = useState('');
  const [typeFilter, setTypeFilter]   = useState<TypeFilter>('all');
  const { dateRange } = useAppStore();

  const transactions = useLiveQuery(
    () =>
      getDB()
        .transactions.orderBy('date')
        .reverse()
        .filter((t) => t.date >= dateRange.from && t.date <= dateRange.to)
        .toArray(),
    [dateRange.from, dateRange.to]
  );
  const accounts   = useLiveQuery(() => getDB().accounts.toArray());
  const categories = useLiveQuery(() => getDB().categories.toArray());

  // Deduplicate categories by name (safety net for legacy data)
  const deduped = useMemo(() => {
    if (!categories) return [];
    const seen = new Set<string>();
    return categories.filter((c) => {
      if (seen.has(c.name.toLowerCase())) return false;
      seen.add(c.name.toLowerCase());
      return true;
    });
  }, [categories]);

  const filtered = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter((t) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !t.payee.toLowerCase().includes(q) &&
          !t.rawPayee.toLowerCase().includes(q) &&
          !t.description.toLowerCase().includes(q)
        ) return false;
      }
      if (categoryId) {
        if (categoryId === '__uncategorised__') {
          if (t.categoryId) return false;
        } else {
          if (t.categoryId !== categoryId) return false;
        }
      }
      if (typeFilter === 'debit'  && t.amount >= 0) return false;
      if (typeFilter === 'credit' && t.amount <  0) return false;
      return true;
    });
  }, [transactions, search, categoryId, typeFilter]);

  const isLoading = transactions === undefined;
  const isEmpty   = !isLoading && transactions.length === 0;
  const isFiltered = !!search.trim() || !!categoryId || typeFilter !== 'all';

  return (
    <PageShell
      title="Transactions"
      description={
        transactions
          ? `${transactions.length.toLocaleString()} transactions`
          : 'Loading…'
      }
      action={
        <LinkButton href="/upload" variant="outline" size="sm" className="gap-2">
          <Upload className="w-4 h-4" /> Import more
        </LinkButton>
      }
    >
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <p className="text-muted-foreground text-sm">No transactions yet.</p>
          <LinkButton href="/upload" variant="outline" size="sm" className="gap-2">
            <Upload className="w-4 h-4" /> Upload a bank statement
          </LinkButton>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search payee or description…"
                className="pl-9 w-56"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Category filter */}
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="text-sm bg-input border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All categories</option>
              <option value="__uncategorised__">Uncategorised</option>
              {deduped.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {/* Debit / Credit toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden text-sm">
              {(['all', 'debit', 'credit'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    'px-3 py-1.5 capitalize transition-colors',
                    typeFilter === t
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
          ) : (
            <>
              <TransactionTable
                transactions={filtered}
                accounts={accounts ?? []}
                categories={categories ?? []}
              />
              {isFiltered && (
                <p className="text-xs text-muted-foreground">
                  {filtered.length.toLocaleString()} of {transactions?.length.toLocaleString()} transactions
                </p>
              )}
            </>
          )}
        </div>
      )}
    </PageShell>
  );
}
