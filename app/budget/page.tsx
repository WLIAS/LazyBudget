'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { ChevronLeft, ChevronRight, Upload } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { LinkButton } from '@/components/ui/link-button';
import { getDB } from '@/lib/db/index';
import { formatMoney } from '@/lib/utils/money';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type PeriodType = 'week' | 'month' | 'quarter' | 'year';

interface PeriodRange {
  from: string;
  to: string;
  label: string;
  chartLabel: string;
  asOf: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PERIOD_TABS: { type: PeriodType; label: string }[] = [
  { type: 'week',    label: 'Week'    },
  { type: 'month',   label: 'Month'   },
  { type: 'quarter', label: 'Quarter' },
  { type: 'year',    label: 'Year'    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function scaleBudget(monthly: number, type: PeriodType): number {
  switch (type) {
    case 'week':    return (monthly * 12) / 52;
    case 'month':   return monthly;
    case 'quarter': return monthly * 3;
    case 'year':    return monthly * 12;
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
      const fmt = (d: Date) => d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
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
      const y = cursor.getFullYear(), m = cursor.getMonth();
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
    let q = Math.floor(start.getMonth() / 3), y = start.getFullYear();
    while (true) {
      const sm = q * 3;
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
    for (let y = parseInt(from.slice(0, 4)); y <= parseInt(to.slice(0, 4)); y++) {
      periods.push({ from: `${y}-01-01`, to: `${y}-12-31`, label: String(y), chartLabel: String(y), asOf: `${y}-01-01` });
    }
  }

  return periods;
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
            <span className="text-muted-foreground truncate max-w-[110px]">{p.dataKey}</span>
          </div>
          <span className="font-mono font-medium">
            {formatMoney(p.value)}
            {total > 0 && (
              <span className="text-muted-foreground font-normal ml-1">
                ({((p.value / total) * 100).toFixed(0)}%)
              </span>
            )}
          </span>
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
  const [breakdown,       setBreakdown]       = useState<PeriodType>('month');
  const [activePeriodIdx, setActivePeriodIdx] = useState(0);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const transactions = useLiveQuery(() => getDB().transactions.toArray());
  const categories   = useLiveQuery(() => getDB().categories.toArray());
  const allBudgets   = useLiveQuery(() => getDB().budgets.toArray());

  // All debit transactions (non-transfer)
  const debitTxns = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter((tx) => !tx.isTransfer && tx.amount < 0);
  }, [transactions]);

  // Date range of all available data
  const txnDateRange = useMemo(() => {
    if (!debitTxns.length) return null;
    let from = debitTxns[0].date, to = debitTxns[0].date;
    for (const tx of debitTxns) {
      if (tx.date < from) from = tx.date;
      if (tx.date > to)   to   = tx.date;
    }
    return { from, to };
  }, [debitTxns]);

  // Group → representative colour (first category in that group)
  const groupColourMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories ?? []) {
      if (cat.group && cat.group !== 'Transfers' && !map.has(cat.group)) {
        map.set(cat.group, cat.colour);
      }
    }
    return map;
  }, [categories]);

  // Per-period data, aggregated by category group (oldest first)
  const periodData = useMemo(() => {
    if (!categories || !allBudgets || !txnDateRange) return [];

    const catMap  = new Map(categories.map((c) => [c.id, c]));
    const periods = generatePeriods(breakdown, txnDateRange.from, txnDateRange.to);

    return periods.map((period) => {
      // Active monthly budgets at period start, keyed by categoryId
      const monthlyByCat = new Map<string, number>();
      for (const b of allBudgets) {
        if (b.effectiveFrom <= period.asOf && (b.effectiveTo === null || b.effectiveTo > period.asOf)) {
          monthlyByCat.set(b.categoryId, b.amount);
        }
      }

      // Spend per category in this period
      const spendByCat = new Map<string, number>();
      for (const tx of debitTxns) {
        if (tx.date < period.from || tx.date > period.to) continue;
        const key = tx.categoryId ?? '__uncategorised__';
        spendByCat.set(key, (spendByCat.get(key) ?? 0) + Math.abs(tx.amount));
      }

      // Aggregate by group
      const groupSpend  = new Map<string, number>();
      const groupBudget = new Map<string, number>();

      for (const [catId, spent] of spendByCat) {
        const group = catId === '__uncategorised__'
          ? 'Other'
          : (catMap.get(catId)?.group ?? 'Other');
        if (group === 'Transfers') continue;
        groupSpend.set(group, (groupSpend.get(group) ?? 0) + spent);
      }

      for (const [catId, monthly] of monthlyByCat) {
        const cat = catMap.get(catId);
        if (!cat || cat.group === 'Transfers') continue;
        const periodAmt = scaleBudget(monthly, breakdown);
        groupBudget.set(cat.group, (groupBudget.get(cat.group) ?? 0) + periodAmt);
      }

      const allGroups = new Set([...groupSpend.keys(), ...groupBudget.keys()]);

      const rows = [...allGroups].map((group) => ({
        id:          group,
        name:        group,
        colour:      groupColourMap.get(group) ?? '#6B7280',
        periodBudget: groupBudget.has(group) ? groupBudget.get(group)! : null,
        spent:        groupSpend.get(group) ?? 0,
      })).sort((a, b) => b.spent - a.spent);

      const totalBudget = rows.reduce((s, r) => s + (r.periodBudget ?? 0), 0);
      const totalSpent  = rows.reduce((s, r) => s + r.spent, 0);
      return { period, rows, totalBudget, totalSpent };
    });
  }, [categories, allBudgets, debitTxns, txnDateRange, breakdown, groupColourMap]);

  // Reset to newest period when breakdown changes
  useEffect(() => {
    setActivePeriodIdx(Math.max(0, periodData.length - 1));
    setSelectedGroupId(null);
  }, [breakdown]); // eslint-disable-line react-hooks/exhaustive-deps

  // Also reset when data first loads
  useEffect(() => {
    if (periodData.length > 0 && activePeriodIdx === 0) {
      setActivePeriodIdx(periodData.length - 1);
    }
  }, [periodData.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chart data: each point is a period, keys are group names
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

  // All groups that appear in any period
  const allGroupsInData = useMemo(() => {
    const groups = new Map<string, string>(); // id → colour
    for (const pd of periodData) {
      for (const row of pd.rows) {
        if (!groups.has(row.id)) groups.set(row.id, row.colour);
      }
    }
    return [...groups.entries()].map(([id, colour]) => ({ id, name: id, colour }));
  }, [periodData]);

  const xInterval = useMemo(() => {
    const n = periodData.length;
    if (n <= 12) return 0;
    if (n <= 24) return 1;
    return Math.ceil(n / 12) - 1;
  }, [periodData.length]);

  function cellOpacity(groupId: string, chartIdx: number): number {
    if (selectedGroupId) return groupId === selectedGroupId ? 1 : 0.12;
    return chartIdx === activePeriodIdx ? 1 : 0.55;
  }

  const activePd  = periodData[activePeriodIdx] ?? null;
  const canGoPrev = activePeriodIdx > 0;
  const canGoNext = activePeriodIdx < periodData.length - 1;
  const isEmpty   = transactions !== undefined && transactions.length === 0;

  return (
    <PageShell title="Budget" description="Budget vs actual spending by category group">
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <p className="text-sm text-muted-foreground">No data yet.</p>
          <LinkButton href="/upload" variant="outline" size="sm" className="gap-2">
            <Upload className="w-4 h-4" /> Upload statement
          </LinkButton>
        </div>
      ) : (
        <div className="space-y-5 max-w-3xl">

          {/* Breakdown tabs */}
          <div className="flex gap-1 p-1 bg-muted/40 rounded-lg border border-border w-fit">
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

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  {selectedGroupId ? selectedGroupId : 'Spend by period'}
                </p>
                {selectedGroupId && (
                  <button
                    onClick={() => setSelectedGroupId(null)}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    Show all
                  </button>
                )}
              </div>

              <ResponsiveContainer width="100%" height={200}>
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
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'currentColor', fillOpacity: 0.04 }} />
                  {allGroupsInData.map((g) => (
                    <Bar key={g.id} dataKey={g.id} stackId="s" fill={g.colour} isAnimationActive={false}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fillOpacity={cellOpacity(g.id, i)} />
                      ))}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>

              {/* Group pills */}
              {allGroupsInData.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {allGroupsInData.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGroupId((prev) => (prev === g.id ? null : g.id))}
                      className={cn(
                        'flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border transition-colors',
                        selectedGroupId === g.id
                          ? 'border-foreground/40 text-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
                        selectedGroupId && selectedGroupId !== g.id ? 'opacity-35' : ''
                      )}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: g.colour }} />
                      {g.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Period table */}
          {activePd && (
            <div className="rounded-lg border border-border overflow-hidden">

              {/* Navigation */}
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

              {/* Stats */}
              {(activePd.totalBudget > 0 || activePd.totalSpent > 0) && (
                <div className="flex items-center gap-4 px-4 py-2 text-xs text-muted-foreground border-b border-border/50 bg-muted/10">
                  {activePd.totalBudget > 0 && <span>Budget {formatMoney(activePd.totalBudget)}</span>}
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

              {/* Rows */}
              {activePd.rows.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">No spend in this period.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border/50">
                      <th className="text-left px-4 py-1.5 font-medium">Group</th>
                      <th className="text-right px-4 py-1.5 font-medium whitespace-nowrap">Budget</th>
                      <th className="text-right px-4 py-1.5 font-medium whitespace-nowrap">Spent</th>
                      <th className="text-right px-4 py-1.5 font-medium whitespace-nowrap">Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePd.rows.map((row) => {
                      const pct       = row.periodBudget && row.periodBudget > 0
                        ? (row.spent / row.periodBudget) * 100 : null;
                      const remaining = row.periodBudget !== null ? row.periodBudget - row.spent : null;
                      const barColour =
                        pct === null ? '' : pct >= 100 ? 'bg-destructive' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';

                      return (
                        <tr
                          key={row.id}
                          className={cn(
                            'border-b border-border/40 last:border-0 hover:bg-muted/20',
                            selectedGroupId && selectedGroupId !== row.id ? 'opacity-40' : ''
                          )}
                        >
                          <td className="px-4 py-2.5 w-full">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.colour }} />
                                <span className="font-medium">{row.name}</span>
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
                          <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                            {row.periodBudget !== null
                              ? formatMoney(row.periodBudget)
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                            {row.spent > 0
                              ? <span className={pct !== null && pct >= 100 ? 'text-destructive font-medium' : ''}>{formatMoney(row.spent)}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                            {remaining !== null
                              ? <span className={remaining < 0 ? 'text-destructive' : 'text-emerald-500'}>
                                  {remaining < 0 ? `-${formatMoney(Math.abs(remaining))}` : formatMoney(remaining)}
                                </span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {!txnDateRange && (
            <p className="text-sm text-muted-foreground py-4">No spend data found.</p>
          )}
        </div>
      )}
    </PageShell>
  );
}
