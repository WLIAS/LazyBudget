'use client';

import { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Upload, X } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { LinkButton } from '@/components/ui/link-button';
import { getDB } from '@/lib/db/index';
import { updateTransaction, getTransactions } from '@/lib/db/transactions';
import { createRule } from '@/lib/db/rules';
import { formatMoney } from '@/lib/utils/money';
import { formatDateShort } from '@/lib/utils/dates';
import { cn } from '@/lib/utils';
import type { Transaction, Category } from '@/lib/db/schema';

interface Notification {
  id: string;
  message: string;
}

export default function ReviewPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const transactions = useLiveQuery(() =>
    getDB().transactions
      .orderBy('date')
      .reverse()
      .filter((t) => !t.isTransfer && !t.categoryId)
      .toArray()
  );

  const categories = useLiveQuery(() => getDB().categories.toArray());

  // Group categories by group for <optgroup> rendering
  const categoryGroups = useMemo(() => {
    if (!categories) return [];
    const map = new Map<string, Category[]>();
    for (const cat of categories) {
      if (cat.name === 'Internal Transfer' || cat.name === 'Uncategorised') continue;
      if (!map.has(cat.group)) map.set(cat.group, []);
      map.get(cat.group)!.push(cat);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [categories]);

  const pushNotification = useCallback((message: string) => {
    const id = Math.random().toString(36).slice(2);
    setNotifications((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4000);
  }, []);

  const handleCategorise = useCallback(async (tx: Transaction, categoryId: string) => {
    if (!categoryId || pending.has(tx.id)) return;

    setPending((p) => new Set(p).add(tx.id));

    try {
      // 1. Apply to this transaction
      await updateTransaction(tx.id, {
        categoryId,
        categorySource: 'user',
        confidence: 1.0,
      });

      // 2. Create exact-match rule for this payee (deduped inside createRule)
      await createRule({
        type: 'exact',
        matchField: 'payee',
        matchValue: tx.payee,
        categoryId,
        priority: 100,
        createdBy: 'user',
      });

      // 3. Apply to all other transactions with the same payee
      const all = await getTransactions();
      const samePayee = all.filter(
        (t) =>
          t.id !== tx.id &&
          t.payee.toLowerCase() === tx.payee.toLowerCase() &&
          !t.isTransfer
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
        `"${tx.payee}" → category applied to ${total} transaction${total !== 1 ? 's' : ''}`
      );
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(tx.id);
        return next;
      });
    }
  }, [pending, pushNotification]);

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
      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="space-y-2 mb-4 max-w-2xl">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-[#34D399]/10 border border-[#34D399]/20 px-4 py-2.5 text-sm text-[#34D399]"
            >
              <span>{n.message}</span>
              <button onClick={() => setNotifications((p) => p.filter((x) => x.id !== n.id))}>
                <X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" />
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
        <div className="max-w-2xl">
          <div className="rounded-lg border border-border overflow-hidden">
            {transactions.map((tx, i) => (
              <div
                key={tx.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 transition-colors',
                  pending.has(tx.id) ? 'opacity-50' : 'hover:bg-muted/20',
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
                <select
                  defaultValue=""
                  disabled={pending.has(tx.id)}
                  onChange={(e) => handleCategorise(tx, e.target.value)}
                  className="text-xs bg-input border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring max-w-[160px] disabled:opacity-50"
                >
                  <option value="" disabled>Pick category…</option>
                  {categoryGroups.map(([group, cats]) => (
                    <optgroup key={group} label={group}>
                      {cats.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                {/* Amount */}
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
