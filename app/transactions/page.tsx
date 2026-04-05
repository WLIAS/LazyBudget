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

export default function TransactionsPage() {
  const [search, setSearch] = useState('');
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
  const accounts = useLiveQuery(() => getDB().accounts.toArray());
  const categories = useLiveQuery(() => getDB().categories.toArray());

  const filtered = useMemo(() => {
    if (!transactions) return [];
    if (!search.trim()) return transactions;
    const q = search.toLowerCase();
    return transactions.filter(
      (t) =>
        t.payee.toLowerCase().includes(q) ||
        t.rawPayee.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  }, [transactions, search]);

  const isLoading = transactions === undefined;
  const isEmpty = !isLoading && transactions.length === 0;

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
          {/* Search */}
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search payee or description…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
              {search && (
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
