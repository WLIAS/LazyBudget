'use client';

import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Upload, Sparkles, X } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { TransactionTable } from '@/components/transactions/transaction-table';
import { LinkButton } from '@/components/ui/link-button';
import { Input } from '@/components/ui/input';
import { getDB } from '@/lib/db/index';
import { useAppStore } from '@/lib/store/app-store';
import { reclassifyUncategorised, type EngineProgress, type EngineResult } from '@/lib/categorisation/engine';
import { cn } from '@/lib/utils';

type TypeFilter = 'all' | 'debit' | 'credit';
type ReclassifyState = 'idle' | 'running';

export default function TransactionsPage() {
  const [search, setSearch]           = useState('');
  const [categoryId, setCategoryId]   = useState('');
  const [typeFilter, setTypeFilter]   = useState<TypeFilter>('all');
  const [reclassifyState, setReclassifyState] = useState<ReclassifyState>('idle');
  const [reclassifyProgress, setReclassifyProgress] = useState<EngineProgress | null>(null);
  const [reclassifyResult, setReclassifyResult] = useState<EngineResult | null>(null);
  const { dateRange } = useAppStore();

  // Prevent double-click triggering concurrent runs
  const runningRef = useRef(false);

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

  // Count of ALL uncategorised non-transfer transactions (not date-range-filtered)
  const uncategorisedCount = useLiveQuery(
    () => getDB().transactions.filter((t) => !t.isTransfer && !t.categoryId).count()
  );

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

  async function handleReclassify() {
    if (runningRef.current) return;
    runningRef.current = true;
    setReclassifyState('running');
    setReclassifyResult(null);
    setReclassifyProgress(null);
    try {
      const result = await reclassifyUncategorised((p) => setReclassifyProgress(p));
      setReclassifyResult(result);
    } finally {
      runningRef.current = false;
      setReclassifyState('idle');
      setReclassifyProgress(null);
    }
  }

  const isRunning = reclassifyState === 'running';
  const hasUncategorised = (uncategorisedCount ?? 0) > 0;

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
          {/* Reclassify result banner */}
          {reclassifyResult && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-accent/50 px-4 py-2.5 text-sm">
              <Sparkles className="w-4 h-4 shrink-0 text-primary" />
              <span className="flex-1">
                Done —{' '}
                {reclassifyResult.aiCategorised + reclassifyResult.ruleMatched > 0
                  ? `categorised ${(reclassifyResult.aiCategorised + reclassifyResult.ruleMatched).toLocaleString()} transaction${reclassifyResult.aiCategorised + reclassifyResult.ruleMatched === 1 ? '' : 's'}`
                  : 'no new categories assigned'}
                {reclassifyResult.needsReview > 0 &&
                  `, ${reclassifyResult.needsReview.toLocaleString()} still need review`}
                {reclassifyResult.errors > 0 &&
                  `, ${reclassifyResult.errors} batch error${reclassifyResult.errors === 1 ? '' : 's'}`}
              </span>
              <button
                onClick={() => setReclassifyResult(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

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

            {/* Re-run AI on uncategorised */}
            {(hasUncategorised || isRunning) && (
              <button
                onClick={handleReclassify}
                disabled={isRunning}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors',
                  isRunning
                    ? 'border-border text-muted-foreground cursor-not-allowed'
                    : 'border-primary/40 text-primary hover:bg-primary/10'
                )}
              >
                <Sparkles className={cn('w-3.5 h-3.5', isRunning && 'animate-pulse')} />
                {isRunning
                  ? reclassifyProgress
                    ? `Running… ${reclassifyProgress.done}/${reclassifyProgress.total}`
                    : 'Running…'
                  : `Re-run AI${uncategorisedCount ? ` (${uncategorisedCount.toLocaleString()} uncategorised)` : ''}`}
              </button>
            )}
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
