'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Pencil, Check, X, Upload } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { LinkButton } from '@/components/ui/link-button';
import { getDB } from '@/lib/db/index';
import { setBudget } from '@/lib/db/budgets';
import { formatMoney } from '@/lib/utils/money';
import { cn } from '@/lib/utils';

// ── Period helpers ────────────────────────────────────────────────────────────

type PeriodType = 'week' | 'month' | 'quarter' | 'year';

interface PeriodRange {
  from: string;
  to: string;
  label: string;
  /** Date used to look up active budgets (start of period) */
  asOf: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getPeriodRange(type: PeriodType, offset: number): PeriodRange {
  const now = new Date();

  if (type === 'week') {
    const daysFromMonday = (now.getDay() + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - daysFromMonday + offset * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const from = isoDate(monday);
    const to   = isoDate(sunday);
    const fmt  = (d: Date) => d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
    const label =
      offset === 0  ? 'This week' :
      offset === -1 ? 'Last week' :
      `${fmt(monday)} – ${fmt(sunday)}`;
    return { from, to, label, asOf: from };
  }

  if (type === 'month') {
    const d    = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const from = isoDate(d);
    const to   = isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const label = d.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' });
    return { from, to, label, asOf: from };
  }

  if (type === 'quarter') {
    const currentQ = Math.floor(now.getMonth() / 3);
    let q = currentQ + offset;
    let year = now.getFullYear();
    while (q < 0) { q += 4; year--; }
    while (q >= 4) { q -= 4; year++; }
    const startMonth = q * 3;
    const from = isoDate(new Date(year, startMonth, 1));
    const to   = isoDate(new Date(year, startMonth + 3, 0));
    return { from, to, label: `Q${q + 1} ${year}`, asOf: from };
  }

  // year
  const year = now.getFullYear() + offset;
  return { from: `${year}-01-01`, to: `${year}-12-31`, label: String(year), asOf: `${year}-01-01` };
}

function scaleBudget(monthlyAmount: number, type: PeriodType): number {
  switch (type) {
    case 'week':    return (monthlyAmount * 12) / 52;
    case 'month':   return monthlyAmount;
    case 'quarter': return monthlyAmount * 3;
    case 'year':    return monthlyAmount * 12;
  }
}

const PERIOD_TABS: { type: PeriodType; label: string }[] = [
  { type: 'week',    label: 'Week'    },
  { type: 'month',   label: 'Month'   },
  { type: 'quarter', label: 'Quarter' },
  { type: 'year',    label: 'Year'    },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [offset, setOffset]         = useState(0);
  const [editing, setEditing]       = useState<string | null>(null);
  const [editValue, setEditValue]   = useState('');
  const [saving, setSaving]         = useState(false);
  const editRef = useRef<HTMLInputElement>(null);

  const transactions = useLiveQuery(() => getDB().transactions.toArray());
  const categories   = useLiveQuery(() => getDB().categories.toArray());
  const allBudgets   = useLiveQuery(() => getDB().budgets.toArray());

  const period = useMemo(() => getPeriodRange(periodType, offset), [periodType, offset]);

  // Active budgets for this period's start date
  const budgetMap = useMemo(() => {
    if (!allBudgets) return new Map<string, { id: string; amount: number }>();
    const active = allBudgets.filter(
      (b) =>
        b.effectiveFrom <= period.asOf &&
        (b.effectiveTo === null || b.effectiveTo > period.asOf)
    );
    return new Map(active.map((b) => [b.categoryId, b]));
  }, [allBudgets, period.asOf]);

  // Total debits per category in the selected period
  const spendMap = useMemo(() => {
    if (!transactions) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.isTransfer || tx.amount >= 0) continue;
      if (tx.date < period.from || tx.date > period.to) continue;
      const key = tx.categoryId ?? '__uncategorised__';
      map.set(key, (map.get(key) ?? 0) + Math.abs(tx.amount));
    }
    return map;
  }, [transactions, period.from, period.to]);

  // Build rows: categories with a budget OR spend in this period
  const rows = useMemo(() => {
    if (!categories) return [];

    const allKeys = new Set([...budgetMap.keys(), ...spendMap.keys()]);

    const result: {
      id: string;
      name: string;
      group: string;
      colour: string;
      periodBudget: number | null;
      monthlyBudget: number | null;
      spent: number;
    }[] = [];

    for (const key of allKeys) {
      const budget = budgetMap.get(key);
      const spent  = spendMap.get(key) ?? 0;

      if (key === '__uncategorised__') {
        if (spent === 0 && !budget) continue;
        result.push({
          id: '__uncategorised__',
          name: 'Uncategorised',
          group: '',
          colour: '#6B7280',
          periodBudget:  budget ? scaleBudget(budget.amount, periodType) : null,
          monthlyBudget: budget?.amount ?? null,
          spent,
        });
        continue;
      }

      const cat = categories.find((c) => c.id === key);
      if (!cat || cat.group === 'Transfers') continue;

      result.push({
        id: key,
        name: cat.name,
        group: cat.group,
        colour: cat.colour,
        periodBudget:  budget ? scaleBudget(budget.amount, periodType) : null,
        monthlyBudget: budget?.amount ?? null,
        spent,
      });
    }

    // Budgeted rows first, then by spend desc
    result.sort((a, b) => {
      const aBudgeted = a.periodBudget !== null;
      const bBudgeted = b.periodBudget !== null;
      if (aBudgeted !== bBudgeted) return aBudgeted ? -1 : 1;
      return b.spent - a.spent;
    });

    return result;
  }, [categories, budgetMap, spendMap, periodType]);

  const totalBudget = useMemo(() => rows.reduce((s, r) => s + (r.periodBudget ?? 0), 0), [rows]);
  const totalSpent  = useMemo(() => rows.reduce((s, r) => s + r.spent, 0), [rows]);

  // Focus edit input as soon as it mounts
  useEffect(() => {
    if (editing && editRef.current) editRef.current.focus();
  }, [editing]);

  function startEdit(id: string, monthlyAmount: number | null) {
    setEditing(id);
    setEditValue(monthlyAmount != null ? String(monthlyAmount) : '');
  }

  async function saveEdit() {
    if (!editing) return;
    const amount = parseFloat(editValue);
    if (isNaN(amount) || amount < 0) { cancelEdit(); return; }
    setSaving(true);
    try {
      await setBudget(editing, amount);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditing(null);
    setEditValue('');
  }

  function handleEditKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  saveEdit();
    if (e.key === 'Escape') cancelEdit();
  }

  const isEmpty = transactions !== undefined && transactions.length === 0;

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

          {/* Period controls */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-muted/40 rounded-lg border border-border">
              {PERIOD_TABS.map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => { setPeriodType(type); setOffset(0); }}
                  className={cn(
                    'px-3 py-1 text-sm rounded-md transition-colors',
                    periodType === type
                      ? 'bg-card text-foreground font-medium shadow-sm border border-border'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Navigator */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setOffset((o) => o - 1)}
                className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Previous period"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium min-w-[150px] text-center select-none">
                {period.label}
              </span>
              <button
                onClick={() => setOffset((o) => Math.min(o + 1, 0))}
                disabled={offset >= 0}
                className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Next period"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label="Total budget" value={totalBudget} />
            <SummaryCard
              label="Total spent"
              value={totalSpent}
              over={totalBudget > 0 && totalSpent > totalBudget}
            />
            <SummaryCard
              label="Remaining"
              value={Math.abs(totalBudget - totalSpent)}
              over={totalBudget > 0 && totalSpent > totalBudget}
              prefix={totalBudget > 0 && totalSpent > totalBudget ? '-' : undefined}
            />
          </div>

          {/* Table */}
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No spend or budgets in this period.
            </p>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2.5 font-medium">Category</th>
                    <th className="text-right px-4 py-2.5 font-medium whitespace-nowrap">Budget</th>
                    <th className="text-right px-4 py-2.5 font-medium whitespace-nowrap">Spent</th>
                    <th className="text-right px-4 py-2.5 font-medium whitespace-nowrap">Remaining</th>
                    <th className="px-2 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isEditing  = editing === row.id;
                    const pct        = row.periodBudget && row.periodBudget > 0
                      ? (row.spent / row.periodBudget) * 100
                      : null;
                    const remaining  = row.periodBudget !== null
                      ? row.periodBudget - row.spent
                      : null;
                    const barColour  =
                      pct === null   ? '' :
                      pct  >= 100    ? 'bg-destructive' :
                      pct  >= 75     ? 'bg-amber-500' :
                                       'bg-emerald-500';

                    return (
                      <tr
                        key={row.id}
                        className="border-b border-border/50 last:border-0 hover:bg-muted/20"
                      >
                        {/* Category */}
                        <td className="px-4 py-3">
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
                              <div className="h-1 rounded-full bg-muted overflow-hidden max-w-[160px]">
                                <div
                                  className={cn('h-full rounded-full transition-all', barColour)}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Budget */}
                        <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-xs text-muted-foreground">/mo</span>
                              <input
                                ref={editRef}
                                type="number"
                                min="0"
                                step="1"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={handleEditKey}
                                onBlur={saveEdit}
                                className="w-24 text-sm text-right bg-input border border-ring rounded px-2 py-0.5 focus:outline-none"
                              />
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
                        <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                          {row.spent > 0 ? (
                            <span className={pct !== null && pct >= 100 ? 'text-destructive font-medium' : ''}>
                              {formatMoney(row.spent)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Remaining */}
                        <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
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

                        {/* Edit */}
                        <td className="px-2 py-3 text-center">
                          {!isEditing && (
                            <button
                              onClick={() => startEdit(row.id, row.monthlyBudget)}
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

                {/* Totals */}
                <tfoot>
                  <tr className="border-t border-border bg-muted/20 text-xs font-medium">
                    <td className="px-4 py-2.5 text-muted-foreground">Total</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {totalBudget > 0 ? formatMoney(totalBudget) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      <span className={totalSpent > totalBudget && totalBudget > 0 ? 'text-destructive' : ''}>
                        {totalSpent > 0 ? formatMoney(totalSpent) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {totalBudget > 0 ? (
                        <span className={totalSpent > totalBudget ? 'text-destructive' : 'text-emerald-500'}>
                          {totalSpent > totalBudget
                            ? `-${formatMoney(totalSpent - totalBudget)}`
                            : formatMoney(totalBudget - totalSpent)}
                        </span>
                      ) : '—'}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Hint for unbudgeted rows */}
          {rows.some((r) => r.periodBudget === null) && (
            <p className="text-xs text-muted-foreground">
              Click <Pencil className="inline w-3 h-3 mx-0.5" /> to set a monthly budget for any category.
            </p>
          )}
        </div>
      )}
    </PageShell>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  over,
  prefix,
}: {
  label: string;
  value: number;
  over?: boolean;
  prefix?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold font-mono', over && 'text-destructive')}>
        {prefix}{formatMoney(value)}
      </p>
    </div>
  );
}
