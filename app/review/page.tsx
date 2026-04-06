'use client';

import { useState, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Upload, X } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { LinkButton } from '@/components/ui/link-button';
import { CategoryPicker } from '@/components/ui/category-picker';
import { getDB } from '@/lib/db/index';
import { updateTransaction } from '@/lib/db/transactions';
import { createRule } from '@/lib/db/rules';
import { formatMoney } from '@/lib/utils/money';
import { formatDateShort } from '@/lib/utils/dates';
import { cn } from '@/lib/utils';
import type { Transaction } from '@/lib/db/schema';

interface Notification {
  id: string;
  message: string;
}

export default function ReviewPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  // Use a ref for in-flight IDs to avoid stale closure issues
  const pendingRef = useRef<Set<string>>(new Set());
  const [, forceUpdate] = useState(0);

  const transactions = useLiveQuery(() =>
    getDB().transactions
      .orderBy('date')
      .reverse()
      .filter((t) => !t.isTransfer && !t.categoryId)
      .toArray()
  );

  const categories = useLiveQuery(() => getDB().categories.toArray());

  // Deduplicate by name in case DB has legacy UUID + stable-ID records
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
      // 1. Categorise this transaction
      await updateTransaction(tx.id, {
        categoryId,
        categorySource: 'user',
        confidence: 1.0,
      });

      // 2. Create / upsert exact-match rule — isolated so failure doesn't block propagation
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

      // 3. Apply to ALL other transactions with the same payee
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

  return (
    <PageShell
      title="Review"
      description={
        transactions
          ? `${transactions.length.toLocaleString()} uncategorised transaction${transactions.length !== 1 ? 's' : ''}`
          : 'Loading…'
      }
    >
      {/* Notifications — fixed center-screen toast */}
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
        <div className="max-w-5xl mx-auto w-full">
          <div className="rounded-lg border border-border">
            {transactions.map((tx, i) => {
              const isPending = pendingRef.current.has(tx.id);
              return (
                <div
                  key={tx.id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 transition-colors',
                    isPending ? 'opacity-40' : 'hover:bg-muted/20',
                    i < transactions.length - 1 && 'border-b border-border/50'
                  )}
                >
                  {/* Payee + date */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.payee || tx.rawPayee}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateShort(tx.date)}
                      {tx.description ? ` · ${tx.description}` : ''}
                    </p>
                  </div>

                  {/* Category picker */}
                  <CategoryPicker
                    categories={deduped}
                    value={null}
                    onChange={(catId) => handleCategorise(tx, catId)}
                    disabled={isPending}
                    className="w-44 shrink-0"
                  />

                  {/* Amount */}
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
      ) : (
        <p className="text-sm text-muted-foreground py-8">Loading…</p>
      )}
    </PageShell>
  );
}
