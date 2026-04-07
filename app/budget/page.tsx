'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { ChevronLeft, ChevronRight, Pencil, Check, X, Upload } from 'lucide-react';
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
  label: string;      // full label (navigation header, tooltip)
  chartLabel: string; // abbreviated (x-axis tick)
  asOf: string;
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

function scaleBudget(monthly: number, type: PeriodType): number {
  switch (type) {
    case 'week':    return (monthly * 12) / 52;
    case 'month':   return monthly;
    case 'quarter': return monthly * 3;
    case 'year':    return monthly * 12;
  }
}

function toMonthly(amount: number, freq: BudgetFreq): number {
  switch (freq) {
    case 'weekly':      return (amount * 52) / 12;
    case 'fortnightly': return (amount * 26) / 12;
    case 'monthly':     return amount;
    case 'quarterly':   return amount / 3;
    case 'annually':    return amount / 12;
  }
}

/** Generate periods oldest-first within [from, to] */
function generatePeriods(type: PeriodType, from: string, to: string): PeriodRange[] {
  const periods: PeriodRange[] = [];

  if (type === 'week') {
    const cursor = new Date(from + 'T00:00:00');
    cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
    while (isoDate(cursor) <= to) {
      const mon = new Date(cursor);
      const sun = new Date(cursor);
      sun.setDate(sun.getDate() + 6);
      const fmt  = (d: Date) => d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
      periods.push({
        from: isoDate(mon), to: isoDate(sun),
        label: `${fmt(mon)} – ${fmt(sun)}`,
        chartLabel: fmt(mon),
        asOf: isoDate(mon),
      });
      cursor.setDate(cursor.getDate() + 7);
    }

  } else if (type === 'month') {
    let cursor = new Date(from.slice(0, 7) + '-01T00:00:00');
    const toYM = to.slice(0, 7);
    while (isoDate(cursor).slice(0, 7) <= toYM) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const pFrom = isoDate(cursor);
      periods.push({
        from: pFrom,
        to: isoDate(new Date(y, m + 1, 0)),
        label: cursor.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' }),
        chartLabel: cursor.toLocaleDateString('en-NZ', { month: 'short', year: '2-digit' }),
        asOf: pFrom,
      });
      cursor = new Date(y, m + 1, 1);
    }

  } else if (type === 'quarter') {
    const start = new Date(from + 'T00:00:00');
    let q = Math.floor(start.getMonth() / 3);
    let y = start.getFullYear();
    while (true) {
      const sm    = q * 3;
      const pFrom = isoDate(new Date(y, sm, 1));
      const pTo   = isoDate(new Date(y, sm + 3, 0));
      periods.push({
        from: pFrom, to: pTo,
        label: `Q${q + 1} ${y}`,
        chartLabel: `Q${q + 1} '${String(y).slice(2)}`,
        asOf: pFrom,
      });
      if (pTo >= to) break;
      q++; if (q >= 4) { q = 0; y++; }
    }

  } else {
    const fy = parseInt(from.slice(0, 4));
    const ty = parseInt(to.slice(0, 4));
    for (let y = fy; y <= ty; y++) {
      periods.push({
        from: `${y}-01-01`, to: `${y}-12-31`,
        label: String(y), chartLabel: String(y),
        asOf: `${y}-01-01`,
      });
    }
  }

  return periods; // oldest first
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function ChartTooltip({
  active, payload,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number; fill: string; payload: { label: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const label = payload[0]?.payload?.label;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-card border border-border rounded-lg p-2.5 text-xs shadow-lg space-y-1 min-w-[140px]">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {[...payload].reverse().map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.fill }} />
            <span className="text-muted-foreground truncate max-w-[100px]">{p.dataKey === '__uncategorised__' ? 'Uncategorised' : p.dataKey}</span>
          </div>
          <span className="font-mono font-medium">{formatMoney(p.value)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="flex justify-between pt-1 mt-1 border-t border-border/50 font-medium">
          <span>Total</span>
          <span className="font-mono">{formatMoney(total)}</span>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const [rangeFrom,         setRangeFrom]         = useState(defaultFrom);
  const [rangeTo,           setRangeTo]           = useState(() => isoDate(new Date()));
  const [breakdown,         setBreakdown]         = useState<PeriodType>('month');
  const [activePeriodIdx,   setActivePeriodIdx]   = useState(0);
  const [selectedCatId,     setSelectedCatId]     = useState<string | null>(null);
  const [editing,           setEditing]           = useState<string | null>(null);
  const [editAmount,        setEditAmount]        = useState('');
  const [editFreq,          setEditFreq]          = useState<BudgetFreq>('monthly');
  const [saving,            setSaving]            = useState(false);
  const editRef = useRef<HTMLInputElement>(null);

  const transactions = useLiveQuery(() => getDB().transactions.toArray());
  const categories   = useLiveQuery(() => getDB().categories.toArray());
  const allBudgets   = useLiveQuery(() => getDB().budgets.toArray());

  useEffect(() => {
    if (editing && editRef.current) editRef.current.focus();
  }, [editing]);

  // Pre-filter debits for the range
  const filteredTxns = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(
      (tx) => !tx.isTransfer && tx.amount < 0 && tx.date >= rangeFrom && tx.date <= rangeTo
    );
  }, [transactions, rangeFrom, rangeTo]);

  // Per-period data (oldest first)
  const periodData = useMemo(() => {
    if (!categories || !allBudgets) return [];
    const catMap  = new Map(categories.map((c) => [c.id, c]));
    const periods = generatePeriods(breakdown, rangeFrom, rangeTo);

    return periods.map((period) => {
      const monthlyMap = new Map<string, number>();
      for (const b of allBudgets) {
        if (b.effectiveFrom <= period.asOf && (b.effectiveTo === null || b.effectiveTo > period.asOf)) {
          monthlyMap.set(b.categoryId, b.amount);
        }
      }

      const spendMap = new Map<string, number>();
      for (const tx of filteredTxns) {
        if (tx.date < period.from || tx.date > period.to) continue;
        const key = tx.categoryId ?? '__uncategorised__';
        spendMap.set(key, (spendMap.get(key) ?? 0) + Math.abs(tx.amount));
      }

      const allKeys = new Set([...monthlyMap.keys(), ...spendMap.keys()]);
      const rows: {
        id: string; name: string; group: string; colour: string;
        periodBudget: number | null; monthlyBudget: number | null; spent: number;
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
          id: key, name: cat.name, group: cat.group, colour: cat.colour,
          periodBudget:  monthly ? scaleBudget(monthly, breakdown) : null,
          monthlyBudget: monthly,
          spent: spendMap.get(key) ?? 0,
        });
      }

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

  // Reset to newest period when controls change
  useEffect(() => {
    setActivePeriodIdx(Math.max(0, periodData.length - 1));
    setSelectedCatId(null);
    setEditing(null);
  }, [breakdown, rangeFrom, rangeTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chart data — each data point is one period
  const chartData = useMemo(
    () => periodData.map((pd) => {
      const item: Record<string, string | number> = {
        xLabel: pd.period.chartLabel,
        label:  pd.period.label,
      };
      for (const row of pd.rows) item[row.id] = row.spent;
      return item;
    }),
    [periodData]
  );

  // All categories that appear in any period (for bar series + pills)
  const allCatsInData = useMemo(() => {
    if (!categories) return [];
    const ids = new Set<string>();
    for (const pd of periodData) for (const row of pd.rows) ids.add(row.id);
    return [...ids].map((id): { id: string; name: string; colour: string } | null => {
      if (id === '__uncategorised__') return { id, name: 'Uncategorised', colour: '#6B7280' };
      const cat = categories.find((c) => c.id === id);
      return cat ? { id, name: cat.name, colour: cat.colour } : null;
    }).filter(Boolean) as { id: string; name: string; colour: string }[];
  }, [periodData, categories]);

  // X-axis tick interval so labels don't crowd
  const xInterval = useMemo(() => {
    const n = periodData.length;
    if (n <= 12) return 0;
    if (n <= 24) return 1;
    if (n <= 52) return Math.ceil(n / 12) - 1;
    return Math.ceil(n / 12) - 1;
  }, [periodData.length]);

  // Cell opacity: period highlight OR category highlight
  function cellOpacity(catId: string, chartIdx: number): number {
    if (selectedCatId) return catId === selectedCatId ? 1 : 0.12;
    return chartIdx === activePeriodIdx ? 1 : 0.55;
  }

  // Today's monthly budget — pre-fills edit form
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

  const activePd   = periodData[activePeriodIdx] ?? null;
  const canGoPrev  = activePeriodIdx > 0;
  const canGoNext  = activePeriodIdx < periodData.length - 1;
  const isEmpty    = transactions !== undefined && transactions.length === 0;

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

          {/* Controls */}
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

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  {selectedCatId
                    ? allCatsInData.find((c) => c.id === selectedCatId)?.name ?? 'Category'
                    : 'Spend by period'}
                </p>
                {selectedCatId && (
                  <button
                    onClick={() => setSelectedCatId(null)}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    Show all
                  </button>
                )}
              </div>

              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={chartData}
                  barCategoryGap="25%"
                  style={{ cursor: 'pointer' }}
                  onClick={(state) => {
                    const idx = state?.activeTooltipIndex;
                    if (typeof idx === 'number') setActivePeriodIdx(idx);
                  }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                  <XAxis
                    dataKey="xLabel"
                    tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }}
                    tickLine={false}
                    axisLine={false}
                    interval={xInterval}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                    width={42}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'currentColor', fillOpacity: 0.04 }}
                  />
                  {allCatsInData.map((cat) => (
                    <Bar key={cat.id} dataKey={cat.id} stackId="s" fill={cat.colour} isAnimationActive={false}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fillOpacity={cellOpacity(cat.id, i)} />
                      ))}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>

              {/* Category pills */}
              {allCatsInData.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {allCatsInData.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCatId((prev) => (prev === cat.id ? null : cat.id))}
                      className={cn(
                        'flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border transition-colors',
                        selectedCatId === cat.id
                          ? 'border-foreground/40 text-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
                        selectedCatId && selectedCatId !== cat.id ? 'opacity-35' : ''
                      )}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.colour }} />
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Period table */}
          {activePd && (
            <div className="rounded-lg border border-border overflow-hidden">

              {/* Navigation bar */}
              <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30 border-b border-border">
                <button
                  onClick={() => setActivePeriodIdx((i) => i - 1)}
                  disabled={!canGoPrev}
                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex-1 flex items-center justify-center gap-3">
                  <span className="font-semibold text-sm">{activePd.period.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {activePeriodIdx + 1} / {periodData.length}
                  </span>
                </div>

                <button
                  onClick={() => setActivePeriodIdx((i) => i + 1)}
                  disabled={!canGoNext}
                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Period stats */}
              {(activePd.totalBudget > 0 || activePd.totalSpent > 0) && (
                <div className="flex items-center gap-4 px-4 py-2 text-xs text-muted-foreground border-b border-border/50 bg-muted/10">
                  {activePd.totalBudget > 0 && (
                    <span>Budget {formatMoney(activePd.totalBudget)}</span>
                  )}
                  <span className={activePd.totalBudget > 0 && activePd.totalSpent > activePd.totalBudget ? 'text-destructive font-medium' : ''}>
                    Spent {formatMoney(activePd.totalSpent)}
                  </span>
                  {activePd.totalBudget > 0 && (
                    <span className={activePd.totalSpent > activePd.totalBudget ? 'text-destructive' : 'text-emerald-500'}>
                      {activePd.totalSpent > activePd.totalBudget
                        ? `${formatMoney(activePd.totalSpent - activePd.totalBudget)} over`
                        : `${formatMoney(activePd.totalBudget - activePd.totalSpent)} left`}
                    </span>
                  )}
                </div>
              )}

              {/* Category rows */}
              {activePd.rows.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">No spend in this period.</p>
              ) : (
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
                    {activePd.rows.map((row) => {
                      const isEditing = editing === row.id;
                      const pct       = row.periodBudget && row.periodBudget > 0
                        ? (row.spent / row.periodBudget) * 100 : null;
                      const remaining = row.periodBudget !== null
                        ? row.periodBudget - row.spent : null;
                      const barColour =
                        pct === null ? '' :
                        pct >= 100   ? 'bg-destructive' :
                        pct >= 75    ? 'bg-amber-500' :
                                       'bg-emerald-500';

                      return (
                        <tr
                          key={row.id}
                          className={cn(
                            'border-b border-border/40 last:border-0 hover:bg-muted/20',
                            selectedCatId && selectedCatId !== row.id ? 'opacity-40' : ''
                          )}
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

                          {/* Budget / edit */}
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

                          {/* Edit */}
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
              )}
            </div>
          )}

          {periodData.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">No data in this range.</p>
          )}
        </div>
      )}
    </PageShell>
  );
}
