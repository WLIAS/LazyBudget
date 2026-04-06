'use client';

import { useMemo, useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Upload,
  Wallet,
  ArrowRight,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { LinkButton } from '@/components/ui/link-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getDB } from '@/lib/db/index';
import { formatMoney } from '@/lib/utils/money';
import { formatDate } from '@/lib/utils/dates';
import { useAppStore } from '@/lib/store/app-store';
import {
  detectTransferPairs,
  applyTransferPairs,
  unflagTransferPair,
  getConfirmedTransferPairs,
  type TransferPair,
} from '@/lib/analytics/transfers';

const LABEL_COLOURS: Record<string, string> = {
  spending:   '#60A5FA',
  bills:      '#FBBF24',
  savings:    '#34D399',
  mortgage:   '#F87171',
  investment: '#A78BFA',
  other:      '#9CA3AF',
};

type DetectionState = 'idle' | 'scanning' | 'preview' | 'applying' | 'done';

export default function AccountsPage() {
  const { dateRange } = useAppStore();

  const accounts = useLiveQuery(() => getDB().accounts.toArray());

  // Confirmed transfer pairs live-queried so unflag updates reflect immediately
  const confirmedPairs = useLiveQuery(() => getConfirmedTransferPairs(), []);

  // stats: own live query using toArray() so ANY write to transactions triggers
  // a re-run — orderBy().filter() only tracks the date index key range, which
  // doesn't change when isTransfer is updated, so it misses transfer confirmations.
  const stats = useLiveQuery(
    async () => {
      const db = getDB();
      const all = await db.transactions.toArray();
      return (accounts ?? []).map((acc) => {
        const txs = all.filter(
          (t) =>
            t.accountId === acc.id &&
            !t.isTransfer &&
            t.date >= dateRange.from &&
            t.date <= dateRange.to
        );
        const inflow  = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
        const outflow = txs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
        return { acc, inflow, outflow, count: txs.length };
      });
    },
    [accounts, dateRange.from, dateRange.to]
  );

  // Detection workflow state
  const [detectionState, setDetectionState] = useState<DetectionState>('idle');
  const [pendingPairs, setPendingPairs] = useState<TransferPair[]>([]);
  const [dismissedIndexes, setDismissedIndexes] = useState<Set<number>>(new Set());
  const [applyResult, setApplyResult] = useState<{ matched: number; updated: number } | null>(null);
  const [unflagging, setUnflagging] = useState<Set<string>>(new Set());

  const accountMap = useMemo(() => {
    const m = new Map<string, string>();
    accounts?.forEach((a) => m.set(a.id, a.name));
    return m;
  }, [accounts]);

  // Transfer flow summary: group confirmed pairs by (fromAccount → toAccount)
  const transferFlows = useMemo(() => {
    if (!confirmedPairs) return [];
    const flowMap = new Map<string, { from: string; to: string; total: number; count: number }>();

    for (const { debit, credit } of confirmedPairs) {
      const key = `${debit.accountId}→${credit.accountId}`;
      const existing = flowMap.get(key);
      if (existing) {
        existing.total += Math.abs(debit.amount);
        existing.count += 1;
      } else {
        flowMap.set(key, {
          from: accountMap.get(debit.accountId) ?? debit.accountId,
          to: accountMap.get(credit.accountId) ?? credit.accountId,
          total: Math.abs(debit.amount),
          count: 1,
        });
      }
    }

    return Array.from(flowMap.values()).sort((a, b) => b.total - a.total);
  }, [confirmedPairs, accountMap]);

  const handleDetect = useCallback(async () => {
    setDetectionState('scanning');
    setDismissedIndexes(new Set());
    setApplyResult(null);

    try {
      const result = await detectTransferPairs();
      setPendingPairs(result.newPairs);
      setDetectionState('preview');
    } catch (e) {
      console.error('[transfers] Detection failed:', e);
      setDetectionState('idle');
    }
  }, []);

  const handleApply = useCallback(async () => {
    setDetectionState('applying');
    const toApply = pendingPairs.filter((_, i) => !dismissedIndexes.has(i));

    try {
      const updated = await applyTransferPairs(toApply);
      setApplyResult({ matched: toApply.length, updated });
      setPendingPairs([]);
      setDetectionState('done');
    } catch (e) {
      console.error('[transfers] Apply failed:', e);
      setDetectionState('preview');
    }
  }, [pendingPairs, dismissedIndexes]);

  const handleUnflag = useCallback(async (txId: string) => {
    setUnflagging((s) => new Set(s).add(txId));
    try {
      await unflagTransferPair(txId);
    } finally {
      setUnflagging((s) => {
        const next = new Set(s);
        next.delete(txId);
        return next;
      });
    }
  }, []);

  const visiblePending = pendingPairs.filter((_, i) => !dismissedIndexes.has(i));

  const isEmpty = accounts !== undefined && accounts.length === 0;

  return (
    <PageShell title="Accounts" description="Account breakdown and transfer detection">
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
        <div className="space-y-8 max-w-4xl">

          {/* ── Account cards ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(stats ?? []).map(({ acc, inflow, outflow, count }) => (
              <Card key={acc.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: LABEL_COLOURS[acc.label] ?? '#9CA3AF' }}
                    />
                    <CardTitle className="text-sm font-semibold truncate">{acc.name}</CardTitle>
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">
                    {acc.label}{acc.bankName ? ` · ${acc.bankName}` : ''}
                  </p>
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

          {/* ── Transfer detection ─────────────────────────────────────────── */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-sm">Transfer Detection</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Matches debits and credits of the same amount across accounts within 2 days.
                </p>
              </div>
              {(detectionState === 'idle' || detectionState === 'done') && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDetect}
                  className="gap-2 shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {confirmedPairs && confirmedPairs.length > 0 ? 'Re-run Detection' : 'Detect Transfers'}
                </Button>
              )}
              {detectionState === 'scanning' && (
                <span className="text-xs text-muted-foreground animate-pulse">Scanning…</span>
              )}
            </div>

            {/* Done banner */}
            {detectionState === 'done' && applyResult && (
              <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-400/10 rounded-md px-3 py-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {applyResult.matched === 0
                  ? 'No new transfer pairs found.'
                  : `${applyResult.matched} transfer pair${applyResult.matched !== 1 ? 's' : ''} confirmed — ${applyResult.updated} transactions updated.`}
              </div>
            )}

            {/* Preview: pending pairs to review */}
            {detectionState === 'preview' && (
              <div className="space-y-3">
                {visiblePending.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No new transfer pairs found. All transactions may already be paired, or there are no matching amounts across accounts.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Found {visiblePending.length} candidate pair{visiblePending.length !== 1 ? 's' : ''}.
                      Dismiss any that are incorrect, then confirm.
                    </p>

                    <div className="rounded-md border border-border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/30">
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">From</th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">To</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Amount</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Confidence</th>
                            <th className="px-2 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {pendingPairs.map((pair, i) => {
                            if (dismissedIndexes.has(i)) return null;
                            return (
                              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20">
                                <td className="px-3 py-2 font-mono text-muted-foreground">
                                  {formatDate(pair.debit.date)}
                                  {pair.daysDiff > 0 && (
                                    <span className="ml-1 text-[10px] text-muted-foreground/60">
                                      +{pair.daysDiff}d
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 max-w-[120px] truncate">
                                  {accountMap.get(pair.debit.accountId) ?? pair.debit.accountId}
                                </td>
                                <td className="px-3 py-2 max-w-[120px] truncate">
                                  {accountMap.get(pair.credit.accountId) ?? pair.credit.accountId}
                                </td>
                                <td className="px-3 py-2 font-mono text-right">
                                  {formatMoney(Math.abs(pair.debit.amount))}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <ConfidencePip value={pair.confidence} />
                                </td>
                                <td className="px-2 py-2 text-right">
                                  <button
                                    onClick={() =>
                                      setDismissedIndexes((s) => new Set([...s, i]))
                                    }
                                    className="text-muted-foreground hover:text-foreground p-0.5"
                                    title="Dismiss this pair"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDetectionState('idle')}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleApply}
                        disabled={visiblePending.length === 0}
                      >
                        Confirm {visiblePending.length} pair{visiblePending.length !== 1 ? 's' : ''}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {detectionState === 'applying' && (
              <p className="text-xs text-muted-foreground animate-pulse">Applying…</p>
            )}
          </section>

          {/* ── Transfer flow summary ──────────────────────────────────────── */}
          {transferFlows.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold text-sm">Transfer Flow</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {transferFlows.map((flow) => (
                  <div
                    key={`${flow.from}→${flow.to}`}
                    className="flex items-center gap-3 px-4 py-3 rounded-md border border-border bg-card"
                  >
                    <span className="text-xs truncate max-w-[90px]">{flow.from}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs truncate max-w-[90px]">{flow.to}</span>
                    <div className="ml-auto text-right shrink-0">
                      <p className="font-mono text-xs">{formatMoney(flow.total)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {flow.count} transfer{flow.count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Confirmed transfer list ────────────────────────────────────── */}
          {confirmedPairs && confirmedPairs.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold text-sm">
                Confirmed Transfers
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {confirmedPairs.length} pair{confirmedPairs.length !== 1 ? 's' : ''}
                </span>
              </h2>

              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">From</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">To</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Amount</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {confirmedPairs.map(({ debit, credit }) => (
                      <tr
                        key={debit.id}
                        className="border-b border-border last:border-0 hover:bg-muted/20"
                      >
                        <td className="px-3 py-2 font-mono text-muted-foreground">
                          {formatDate(debit.date)}
                        </td>
                        <td className="px-3 py-2 max-w-[110px] truncate">
                          {accountMap.get(debit.accountId) ?? debit.accountId}
                        </td>
                        <td className="px-3 py-2 max-w-[110px] truncate">
                          {accountMap.get(credit.accountId) ?? credit.accountId}
                        </td>
                        <td className="px-3 py-2 font-mono text-right">
                          {formatMoney(Math.abs(debit.amount))}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            onClick={() => handleUnflag(debit.id)}
                            disabled={unflagging.has(debit.id)}
                            className="text-muted-foreground hover:text-destructive p-0.5 transition-colors"
                            title="Remove transfer pairing"
                          >
                            {unflagging.has(debit.id) ? (
                              <AlertCircle className="w-3.5 h-3.5 animate-pulse" />
                            ) : (
                              <X className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

        </div>
      )}
    </PageShell>
  );
}

function ConfidencePip({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const colour =
    pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-muted-foreground';
  return <span className={`font-mono ${colour}`}>{pct}%</span>;
}
