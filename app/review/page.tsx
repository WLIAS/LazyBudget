'use client';

import { useState, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Upload, X, Search, ArrowUpDown } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { LinkButton } from '@/components/ui/link-button';
import { CategoryPicker } from '@/components/ui/category-picker';
import { Input } from '@/components/ui/input';
import { getDB } from '@/lib/db/index';
import { updateTransaction } from '@/lib/db/transactions';
import { createRule } from '@/lib/db/rules';
import { formatMoney } from '@/lib/utils/money';
import { formatDateDMY } from '@/lib/utils/dates';
import { cn } from '@/lib/utils';
import type { Transaction } from '@/lib/db/schema';

interface Notification {
  id: string;
  message: string;
}

type TypeFilter = 'all' | 'debit' | 'credit';
type SortKey = 'date-desc' | 'date-asc' | 'amount-asc' | 'amount-desc';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'date-desc',   label: 'Date: newest' },
  { value: 'date-asc',    label: 'Date: oldest' },
  { value: 'amount-asc',  label: 'Amount: lowest' },
  { value: 'amount-desc', label: 'Amount: highest' },
];

export default function ReviewPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const pendingRef = useRef<Set<string>>(new Set());
  const [, forceUpdate] = useState(0);

  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortKey, setSortKey]       = useState<SortKey>('date-desc');
  const [sortOpen, setSortOpen]     = useState(false);

  const transactions = useLiveQuery(() =>
    getDB().transactions
      .orderBy('date')
      .reverse()
      .filter((t) => !t.isTransfer && !t.categoryId)
      .toArray()
  );

  const categories = useLiveQuery(() => getDB().categories.toArray());
  const accounts   = useLiveQuery(() => getDB().accounts.toArray());

  const accountMap = useMemo(() => {
    const m = new Map<string, string>();
    accounts?.forEach((a) => m.set(a.id, a.name));
    return m;
  }, [accounts]);

  const deduped = useMemo(() => {
    if (!categories) return [];
    const seen = new Set<string>();
    return categories.filter((c) => {
      const key = c.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [categories]);

  const filtered = useMemo(() => {
    if (!transactions) return [];
    let result = transactions;

    if (typeFilter === 'debit')  result = result.filter((t) => t.amount < 0);
    if (typeFilter === 'credit') result = result.filter((t) => t.amount > 0);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((t) =>
        (t.payee || t.rawPayee).toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    }

    return [...result].sort((a, b) => {
      switch (sortKey) {
        case 'date-asc':    return a.date.localeCompare(b.date);
        case 'date-desc':   return b.date.localeCompare(a.date);
        case 'amount-asc':  return a.amount - b.amount;
        case 'amount-desc': return b.amount - a.amount;
      }
    });
  }, [transactions, typeFilter, search, sortKey]);

  function pushNotification(message: string) {
    const id = Math.random().toString(36).slice(2);
    setNotifications((prev) => [...prev, { id, message }]);
    setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== id)), 4000);
  }

  async function handleCategorise(tx: Transaction, categoryId: string) {
    if (!categoryId || pendingRef.current.has(tx.id)) return;
    pendingRef.current.add(tx.id);
    forceUpdate((n) => n + 1);

    try {
      await updateTransaction(tx.id, {
        categoryId,
        categorySource: 'user',
        confidence: 1.0,
      });

      try {
        await createRule({
          type: 'exact',
          matchField: 'payee',
          matchValue: tx.payee || tx.rawPayee,
          categoryId,
          priority: 100,
          createdBy: 'user',
        });
      } catch (e) {
        console.error('[review] createRule failed (propagation will still run):', e);
      }

      const payeeKey = (tx.payee || tx.rawPayee).toLowerCase();
      const all = await getDB().transactions.toArray();
      const samePayee = all.filter(
        (t) =>
          t.id !== tx.id &&
          !t.isTransfer &&
          (t.payee || t.rawPayee).toLowerCase() === payeeKey
      );

      if (samePayee.length > 0) {
        await Promise.all(
          samePayee.map((t) =>
            updateTransaction(t.id, {
              categoryId,
              categorySource: 'rule',
              confidence: 1.0,
            })
          )
        );
      }

      const total = 1 + samePayee.length;
      pushNotification(
        `"${tx.payee || tx.rawPayee}" applied to ${total} transaction${total !== 1 ? 's' : ''}`
      );
    } catch (e) {
      console.error('[review] categorise failed:', e);
    } finally {
      pendingRef.current.delete(tx.id);
      forceUpdate((n) => n + 1);
    }
  }

  const isEmpty = transactions !== undefined && transactions.length === 0;
  const hasData = transactions !== undefined && transactions.length > 0;
  const totalCount = transactions?.length ?? 0;
  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? '';

  return (
    <PageShell
      title="Review"
      description={
        transactions
          ? `${totalCount.toLocaleString()} uncategorised transaction${totalCount !== 1 ? 's' : ''}`
          : 'Loading…'
      }
    >
      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="pointer-events-auto flex items-center gap-3 rounded-xl bg-[#111827] border border-[#34D399]/30 shadow-xl px-5 py-3 text-sm text-[#34D399]"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{n.message}</span>
              <button
                onClick={() => setNotifications((p) => p.filter((x) => x.id !== n.id))}
                className="ml-1 opacity-50 hover:opacity-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

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
        <div className="max-w-5xl mx-auto w-full space-y-3">

          {/* Filter / sort bar */}
          <div className="flex items-center gap-2 flex-wrap">

            {/* Search */}
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search payee or description…"
                className="pl-8 h-8 text-xs"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Debit / Credit toggle */}
            <div className="flex rounded-md border border-border overflow-hidden text-xs shrink-0">
              {(['all', 'debit', 'credit'] as TypeFilter[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setTypeFilter(v)}
                  className={cn(
                    'px-3 py-1.5 capitalize transition-colors',
                    typeFilter === v
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  {v}
                </button>
              ))}
            </div>

            {/* Sort dropdown */}
            <div className="relative shrink-0">
              <button
                onClick={() => setSortOpen((o) => !o)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs transition-colors',
                  sortOpen
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                {currentSortLabel}
              </button>
              {sortOpen && (
                <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-md border border-border bg-popover shadow-lg overflow-hidden">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setSortKey(opt.value); setSortOpen(false); }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-xs transition-colors',
                        sortKey === opt.value
                          ? 'bg-accent text-foreground font-medium'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Result count when filtered */}
            {(search || typeFilter !== 'all') && (
              <span className="text-xs text-muted-foreground ml-auto">
                {filtered.length} of {totalCount}
              </span>
            )}
          </div>

          {/* Transaction list */}
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No transactions match the current filters.
            </p>
          ) : (
            <div className="rounded-lg border border-border">
              {filtered.map((tx, i) => {
                const isPending = pendingRef.current.has(tx.id);
                return (
                  <div
                    key={tx.id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 transition-colors',
                      isPending ? 'opacity-40' : 'hover:bg-muted/20',
                      i < filtered.length - 1 && 'border-b border-border/50'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{tx.payee || tx.rawPayee}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateDMY(tx.date)}
                        {accountMap.get(tx.accountId) ? ` · ${accountMap.get(tx.accountId)}` : ''}
                        {tx.description ? ` · ${tx.description}` : ''}
                      </p>
                    </div>

                    <CategoryPicker
                      categories={deduped}
                      value={null}
                      onChange={(catId) => handleCategorise(tx, catId)}
                      disabled={isPending}
                      className="w-44 shrink-0"
                    />

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
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-8">Loading…</p>
      )}
    </PageShell>
  );
}
