'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, Check, X, Upload } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { LinkButton } from '@/components/ui/link-button';
import { getDB } from '@/lib/db/index';
import { setBudget } from '@/lib/db/budgets';
import { formatMoney } from '@/lib/utils/money';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type PeriodType = 'week' | 'month' | 'quarter' | 'year';
type BudgetFreq = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annually';

interface PeriodRange {
  from: string;
  to: string;
  label: string;
  asOf: string; // representative date for active-budget lookup
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PERIOD_TABS: { type: PeriodType; label: string }[] = [
  { type: 'week',    label: 'Week'    },
  { type: 'month',   label: 'Month'   },
  { type: 'quarter', label: 'Quarter' },
  { type: 'year',    label: 'Year'    },
];

const FREQ_OPTIONS: { value: BudgetFreq; label: string }[] = [
  { value: 'weekly',      label: 'Weekly'      },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly',     label: 'Monthly'     },
  { value: 'quarterly',   label: 'Quarterly'   },
  { value: 'annually',    label: 'Annually'    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultFrom(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 2);
  d.setDate(1);
  return isoDate(d);
}

/** Monthly amount → period-scaled amount */
function scaleBudget(monthly: number, type: PeriodType): number {
  switch (type) {
    case 'week':    return (monthly * 12) / 52;
    case 'month':   return monthly;
    case 'quarter': return monthly * 3;
    case 'year':    return monthly * 12;
  }
}

/** User-entered amount at given frequency → monthly storage amount */
function toMonthly(amount: number, freq: BudgetFreq): number {
  switch (freq) {
    case 'weekly':      return (amount * 52) / 12;
    case 'fortnightly': return (amount * 26) / 12;
    case 'monthly':     return amount;
    case 'quarterly':   return amount / 3;
    case 'annually':    return amount / 12;
  }
}

/** Generate all periods of `type` that overlap with [from, to], newest first */
function generatePeriods(type: PeriodType, from: string, to: string): PeriodRange[] {
  const periods: PeriodRange[] = [];

  if (type === 'week') {
    const cursor = new Date(from + 'T00:00:00');
    cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7)); // align to Monday
    while (isoDate(cursor) <= to) {
      const mon = new Date(cursor);
      const sun = new Date(cursor);
      sun.setDate(sun.getDate() + 6);
      const fmt = (d: Date) => d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
      periods.push({ from: isoDate(mon), to: isoDate(sun), label: `${fmt(mon)} – ${fmt(sun)}`, asOf: isoDate(mon) });
      cursor.setDate(cursor.getDate() + 7);
    }

  } else if (type === 'month') {
    let cursor = new Date(from.slice(0, 7) + '-01T00:00:00');
    const toYM = to.slice(0, 7);
    while (isoDate(cursor).slice(0, 7) <= toYM) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      periods.push({
        from: isoDate(cursor),
        to:   isoDate(new Date(y, m + 1, 0)),
        label: cursor.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' }),
        asOf: isoDate(cursor),
      });
      cursor = new Date(y, m + 1, 1);
    }

  } else if (type === 'quarter') {
    const start = new Date(from + 'T00:00:00');
    let q = Math.floor(start.getMonth() / 3);
    let y = start.getFullYear();
    while (true) {
      const sm   = q * 3;
      const pFrom = isoDate(new Date(y, sm, 1));
      const pTo   = isoDate(new Date(y, sm + 3, 0));
      periods.push({ from: pFrom, to: pTo, label: `Q${q + 1} ${y}`, asOf: pFrom });
      if (pTo >= to) break;
      q++; if (q >= 4) { q = 0; y++; }
    }

  } else {
    // year
    const fy = parseInt(from.slice(0, 4));
    const ty = parseInt(to.slice(0, 4));
    for (let y = fy; y <= ty; y++) {
      periods.push({ from: `${y}-01-01`, to: `${y}-12-31`, label: String(y), asOf: `${y}-01-01` });
    }
  }

  return periods.reverse(); // newest first
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const [rangeFrom,   setRangeFrom]   = useState(defaultFrom);
  const [rangeTo,     setRangeTo]     = useState(() => isoDate(new Date()));
  const [breakdown,   setBreakdown]   = useState<PeriodType>('month');
  const [editing,     setEditing]     = useState<string | null>(null); // categoryId
  const [editAmount,  setEditAmount]  = useState('');
  const [editFreq,    setEditFreq]    = useState<BudgetFreq>('monthly');
  const [saving,      setSaving]      = useState(false);
  const editRef = useRef<HTMLInputElement>(null);

  const transactions = useLiveQuery(() => getDB().transactions.toArray());
  const categories   = useLiveQuery(() => getDB().categories.toArray());
  const allBudgets   = useLiveQuery(() => getDB().budgets.toArray());

  useEffect(() => {
    if (editing && editRef.current) editRef.current.focus();
  }, [editing]);

  // Debits in the selected range (pre-filtered for perf)
  const filteredTxns = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(
      (tx) => !tx.isTransfer && tx.amount < 0 && tx.date >= rangeFrom && tx.date <= rangeTo
    );
  }, [transactions, rangeFrom, rangeTo]);

  // Build per-period rows
  const periodData = useMemo(() => {
    if (!categories || !allBudgets) return [];

    const catMap  = new Map(categories.map((c) => [c.id, c]));
    const periods = generatePeriods(breakdown, rangeFrom, rangeTo);

    return periods.map((period) => {
      // Active monthly budgets at period start
      const monthlyMap = new Map<string, number>(); // categoryId → monthly amount
      for (const b of allBudgets) {
        if (b.effectiveFrom <= period.asOf && (b.effectiveTo === null || b.effectiveTo > period.asOf)) {
          monthlyMap.set(b.categoryId, b.amount);
        }
      }

      // Spend within period
      const spendMap = new Map<string, number>();
      for (const tx of filteredTxns) {
        if (tx.date < period.from || tx.date > period.to) continue;
        const key = tx.categoryId ?? '__uncategorised__';
        spendMap.set(key, (spendMap.get(key) ?? 0) + Math.abs(tx.amount));
      }

      const allKeys = new Set([...monthlyMap.keys(), ...spendMap.keys()]);

      const rows: {
        id: string;
        name: string;
        group: string;
        colour: string;
        periodBudget: number | null;
        monthlyBudget: number | null;
        spent: number;
      }[] = [];

      for (const key of allKeys) {
        const monthly = monthlyMap.get(key) ?? null;

        if (key === '__uncategorised__') {
          rows.push({
            id: '__uncategorised__', name: 'Uncategorised', group: '', colour: '#6B7280',
            periodBudget:  monthly ? scaleBudget(monthly, breakdown) : null,
            monthlyBudget: monthly,
            spent: spendMap.get(key) ?? 0,
          });
          continue;
        }

        const cat = catMap.get(key);
        if (!cat || cat.group === 'Transfers') continue;

        rows.push({
          id: key,
          name: cat.name,
          group: cat.group,
          colour: cat.colour,
          periodBudget:  monthly ? scaleBudget(monthly, breakdown) : null,
          monthlyBudget: monthly,
          spent: spendMap.get(key) ?? 0,
        });
      }

      // Budgeted rows first, then by spend desc
      rows.sort((a, b) => {
        const aBudgeted = a.periodBudget !== null;
        const bBudgeted = b.periodBudget !== null;
        if (aBudgeted !== bBudgeted) return aBudgeted ? -1 : 1;
        return b.spent - a.spent;
      });

      const totalBudget = rows.reduce((s, r) => s + (r.periodBudget ?? 0), 0);
      const totalSpent  = rows.reduce((s, r) => s + r.spent, 0);

      return { period, rows, totalBudget, totalSpent };
    });
  }, [categories, allBudgets, filteredTxns, breakdown, rangeFrom, rangeTo]);

  // Today's active monthly budget per category — pre-fills the edit form
  const currentBudgetMap = useMemo(() => {
    if (!allBudgets) return new Map<string, number>();
    const today = isoDate(new Date());
    const map   = new Map<string, number>();
    for (const b of allBudgets) {
      if (b.effectiveFrom <= today && (b.effectiveTo === null || b.effectiveTo > today)) {
        map.set(b.categoryId, b.amount);
      }
    }
    return map;
  }, [allBudgets]);

  function startEdit(categoryId: string) {
    const monthly = currentBudgetMap.get(categoryId) ?? null;
    setEditing(categoryId);
    setEditAmount(monthly !== null ? String(monthly) : '');
    setEditFreq('monthly');
  }

  async function saveEdit() {
    if (!editing) return;
    const amount = parseFloat(editAmount);
    if (isNaN(amount) || amount < 0) { cancelEdit(); return; }
    setSaving(true);
    try {
      await setBudget(editing, toMonthly(amount, editFreq));
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditing(null);
    setEditAmount('');
  }

  function handleEditKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  saveEdit();
    if (e.key === 'Escape') cancelEdit();
  }

  const isEmpty  = transactions !== undefined && transactions.length === 0;
  const hasData  = periodData.some((p) => p.rows.length > 0);
  const anyUnbudgeted = periodData.some((p) => p.rows.some((r) => r.periodBudget === null));

  return (
    <PageShell title="Budget" description="Budget vs actual spending by category">
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <p className="text-sm text-muted-foreground">No data yet.</p>
          <LinkButton href="/upload" variant="outline" size="sm" className="gap-2">
            <Upload className="w-4 h-4" /> Upload statement
          </LinkButton>
        </div>
      ) : (
        <div className="space-y-5 max-w-3xl">

          {/* Controls ── date range + breakdown */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2">
              <div className="space-y-0.5">
                <label className="text-xs text-muted-foreground">From</label>
                <input
                  type="date"
                  value={rangeFrom}
                  max={rangeTo}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  className="text-sm bg-input border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <span className="text-muted-foreground mt-4">–</span>
              <div className="space-y-0.5">
                <label className="text-xs text-muted-foreground">To</label>
                <input
                  type="date"
                  value={rangeTo}
                  min={rangeFrom}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className="text-sm bg-input border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <div className="space-y-0.5">
              <label className="text-xs text-muted-foreground">Breakdown</label>
              <div className="flex gap-1 p-1 bg-muted/40 rounded-lg border border-border">
                {PERIOD_TABS.map(({ type, label }) => (
                  <button
                    key={type}
                    onClick={() => setBreakdown(type)}
                    className={cn(
                      'px-3 py-1 text-sm rounded-md transition-colors',
                      breakdown === type
                        ? 'bg-card text-foreground font-medium shadow-sm border border-border'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Period sections */}
          {!hasData ? (
            <p className="text-sm text-muted-foreground py-4">No data in this range.</p>
          ) : (
            <div className="space-y-5">
              {periodData.map(({ period, rows, totalBudget, totalSpent }) => {
                if (rows.length === 0) return null;
                const over = totalBudget > 0 && totalSpent > totalBudget;

                return (
                  <div key={period.from} className="rounded-lg border border-border overflow-hidden">

                    {/* Period header */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
                      <span className="font-semibold text-sm">{period.label}</span>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {totalBudget > 0 && (
                          <span>Budget {formatMoney(totalBudget)}</span>
                        )}
                        <span className={over ? 'text-destructive font-medium' : ''}>
                          Spent {formatMoney(totalSpent)}
                        </span>
                        {totalBudget > 0 && (
                          <span className={over ? 'text-destructive' : 'text-emerald-500'}>
                            {over
                              ? `${formatMoney(totalSpent - totalBudget)} over`
                              : `${formatMoney(totalBudget - totalSpent)} left`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Category rows */}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b border-border/50">
                          <th className="text-left px-4 py-1.5 font-medium">Category</th>
                          <th className="text-right px-4 py-1.5 font-medium whitespace-nowrap">Budget</th>
                          <th className="text-right px-4 py-1.5 font-medium whitespace-nowrap">Spent</th>
                          <th className="text-right px-4 py-1.5 font-medium whitespace-nowrap">Remaining</th>
                          <th className="px-2 py-1.5 w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const isEditing = editing === row.id;
                          const pct =
                            row.periodBudget && row.periodBudget > 0
                              ? (row.spent / row.periodBudget) * 100
                              : null;
                          const remaining =
                            row.periodBudget !== null ? row.periodBudget - row.spent : null;
                          const barColour =
                            pct === null ? '' :
                            pct >= 100   ? 'bg-destructive' :
                            pct >= 75    ? 'bg-amber-500' :
                                           'bg-emerald-500';

                          return (
                            <tr
                              key={row.id}
                              className="border-b border-border/40 last:border-0 hover:bg-muted/20"
                            >
                              {/* Category */}
                              <td className="px-4 py-2.5 w-full">
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: row.colour }}
                                    />
                                    <span className="font-medium">{row.name}</span>
                                    {row.group && (
                                      <span className="text-xs text-muted-foreground hidden sm:inline">
                                        {row.group}
                                      </span>
                                    )}
                                  </div>
                                  {pct !== null && (
                                    <div className="h-1 rounded-full bg-muted overflow-hidden max-w-[140px]">
                                      <div
                                        className={cn('h-full rounded-full transition-all', barColour)}
                                        style={{ width: `${Math.min(pct, 100)}%` }}
                                      />
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Budget / edit form */}
                              <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                                {isEditing ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <input
                                      ref={editRef}
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={editAmount}
                                      onChange={(e) => setEditAmount(e.target.value)}
                                      onKeyDown={handleEditKey}
                                      className="w-20 text-sm text-right bg-input border border-ring rounded px-2 py-0.5 focus:outline-none"
                                    />
                                    <select
                                      value={editFreq}
                                      onChange={(e) => setEditFreq(e.target.value as BudgetFreq)}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      className="text-xs bg-input border border-border rounded px-1.5 py-0.5 text-muted-foreground focus:outline-none"
                                    >
                                      {FREQ_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                      ))}
                                    </select>
                                    <button
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={saveEdit}
                                      disabled={saving}
                                      className="p-0.5 text-emerald-500 hover:text-emerald-400"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={cancelEdit}
                                      className="p-0.5 text-muted-foreground hover:text-foreground"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : row.periodBudget !== null ? (
                                  <span>{formatMoney(row.periodBudget)}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>

                              {/* Spent */}
                              <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                                {row.spent > 0 ? (
                                  <span className={pct !== null && pct >= 100 ? 'text-destructive font-medium' : ''}>
                                    {formatMoney(row.spent)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>

                              {/* Remaining */}
                              <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                                {remaining !== null ? (
                                  <span className={remaining < 0 ? 'text-destructive' : 'text-emerald-500'}>
                                    {remaining < 0
                                      ? `-${formatMoney(Math.abs(remaining))}`
                                      : formatMoney(remaining)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>

                              {/* Edit button */}
                              <td className="px-2 py-2.5 text-center">
                                {!isEditing && (
                                  <button
                                    onClick={() => startEdit(row.id)}
                                    className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                                    title="Set budget"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}

          {hasData && anyUnbudgeted && (
            <p className="text-xs text-muted-foreground">
              Click <Pencil className="inline w-3 h-3 mx-0.5" /> to set a budget for any category.
            </p>
          )}
        </div>
      )}
    </PageShell>
  );
}
