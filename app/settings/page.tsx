'use client';

import { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { getDB } from '@/lib/db/index';

type ClearTarget = 'transactions' | 'all';

export default function SettingsPage() {
  const [confirming, setConfirming] = useState<ClearTarget | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  async function clearTransactions() {
    try {
      const db = getDB();
      await db.transactions.clear();
      await db.importBatches.clear();
      setStatus({ type: 'success', msg: 'All transactions cleared.' });
    } catch (e) {
      setStatus({ type: 'error', msg: String(e) });
    }
    setConfirming(null);
  }

  async function clearAll() {
    try {
      const db = getDB();
      await db.transactions.clear();
      await db.importBatches.clear();
      await db.accounts.clear();
      await db.rules.clear();
      await db.budgets.clear();
      setStatus({ type: 'success', msg: 'All data cleared.' });
    } catch (e) {
      setStatus({ type: 'error', msg: String(e) });
    }
    setConfirming(null);
  }

  return (
    <PageShell title="Settings" description="Manage your local data">
      <div className="max-w-lg space-y-6">
        {status && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              status.type === 'success'
                ? 'bg-[#34D399]/10 text-[#34D399] border border-[#34D399]/20'
                : 'bg-destructive/10 text-destructive border border-destructive/20'
            }`}
          >
            {status.msg}
          </div>
        )}

        {/* Clear transactions */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-start gap-3">
            <Trash2 className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold text-sm">Clear transactions</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Removes all imported transactions and import history. Accounts and categories are kept.
              </p>
            </div>
          </div>

          {confirming === 'transactions' ? (
            <div className="flex items-center gap-3 pt-1">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
              <span className="text-xs text-muted-foreground flex-1">Are you sure? This cannot be undone.</span>
              <button
                onClick={() => setConfirming(null)}
                className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={clearTransactions}
                className="text-xs px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Clear
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setStatus(null); setConfirming('transactions'); }}
              className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors"
            >
              Clear transactions
            </button>
          )}
        </div>

        {/* Clear everything */}
        <div className="rounded-xl border border-destructive/30 bg-card p-5 space-y-3">
          <div className="flex items-start gap-3">
            <Trash2 className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold text-sm text-destructive">Clear all data</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Removes everything — transactions, accounts, rules, and budgets. Categories will be re-seeded on next load.
              </p>
            </div>
          </div>

          {confirming === 'all' ? (
            <div className="flex items-center gap-3 pt-1">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <span className="text-xs text-muted-foreground flex-1">This will wipe all your data. Cannot be undone.</span>
              <button
                onClick={() => setConfirming(null)}
                className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={clearAll}
                className="text-xs px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Wipe everything
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setStatus(null); setConfirming('all'); }}
              className="text-xs px-3 py-1.5 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
            >
              Clear all data
            </button>
          )}
        </div>
      </div>
    </PageShell>
  );
}
