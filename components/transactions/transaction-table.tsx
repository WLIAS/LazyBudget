'use client';

import { useMemo, useState } from 'react';
import type { Transaction, Account, Category } from '@/lib/db/schema';
import { formatMoney } from '@/lib/utils/money';
import { formatDateShort } from '@/lib/utils/dates';
import { CategoryBadge } from './category-badge';
import { cn } from '@/lib/utils';
import { ArrowUpDown } from 'lucide-react';

interface TransactionTableProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
}

type SortKey = 'date' | 'amount' | 'payee';
type SortDir = 'asc' | 'desc';

export function TransactionTable({ transactions, accounts, categories }: TransactionTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts]
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  const sorted = useMemo(() => {
    return [...transactions].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') cmp = a.date.localeCompare(b.date);
      else if (sortKey === 'amount') cmp = a.amount - b.amount;
      else if (sortKey === 'payee') cmp = a.payee.localeCompare(b.payee);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [transactions, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortTh({ col, label }: { col: SortKey; label: string }) {
    return (
      <th
        className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap"
        onClick={() => toggleSort(col)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <ArrowUpDown className={cn('w-3 h-3', sortKey === col ? 'opacity-100' : 'opacity-30')} />
        </span>
      </th>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        No transactions match your filters.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30">
            <tr>
              <SortTh col="date" label="Date" />
              <SortTh col="payee" label="Payee" />
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Description</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">Category</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">Account</th>
              <SortTh col="amount" label="Amount" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((tx) => {
              const category = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
              const account = accountMap.get(tx.accountId);
              return (
                <tr
                  key={tx.id}
                  className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateShort(tx.date)}
                  </td>
                  <td className="px-4 py-3 max-w-[180px]">
                    <p className="truncate font-medium text-sm">{tx.payee || tx.rawPayee}</p>
                  </td>
                  <td className="px-4 py-3 max-w-[160px] hidden md:table-cell">
                    <p className="truncate text-xs text-muted-foreground">{tx.description}</p>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <CategoryBadge category={category} source={tx.categorySource} />
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs text-muted-foreground">{account?.name ?? '—'}</span>
                  </td>
                  <td className={cn(
                    'px-4 py-3 text-right font-mono text-xs whitespace-nowrap font-medium',
                    tx.amount >= 0 ? 'amount-positive' : 'amount-negative'
                  )}>
                    {formatMoney(tx.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
