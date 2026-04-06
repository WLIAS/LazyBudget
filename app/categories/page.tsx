'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Upload, Plus, X, Check, ArrowUp, ArrowDown, ArrowUpDown, Eye, EyeOff } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { LinkButton } from '@/components/ui/link-button';
import { getDB } from '@/lib/db/index';
import { createCategory } from '@/lib/db/categories';
import { formatMoney } from '@/lib/utils/money';
import { useAppStore } from '@/lib/store/app-store';
import { cn } from '@/lib/utils';

const COLOUR_PALETTE = [
  '#60A5FA', '#34D399', '#FBBF24', '#F87171',
  '#A78BFA', '#FB923C', '#EC4899', '#9CA3AF',
];

type SortCol = 'net' | 'spend' | 'gain';
type SortDir = 'desc' | 'asc';

interface CategoryRow {
  id: string;
  name: string;
  group: string;
  colour: string;
  spend: number;   // sum of debits (positive value)
  gain: number;    // sum of credits (positive value)
  net: number;     // spend − gain (positive = net outflow)
  count: number;
}

export default function CategoriesPage() {
  const { dateRange } = useAppStore();
  const [showForm, setShowForm]     = useState(false);
  const [formName, setFormName]     = useState('');
  const [formGroup, setFormGroup]   = useState('');
  const [formColour, setFormColour] = useState(COLOUR_PALETTE[0]);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  const [sortCol, setSortCol]       = useState<SortCol>('net');
  const [sortDir, setSortDir]       = useState<SortDir>('desc');
  const [excluded, setExcluded]     = useState<Set<string>>(new Set());

  const transactions = useLiveQuery(() =>
    getDB().transactions.orderBy('date').reverse().toArray()
  );
  const categories = useLiveQuery(() => getDB().categories.toArray());

  const categoryMap = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c])),
    [categories]
  );

  const existingGroups = useMemo(() => {
    if (!categories) return [];
    const groups = new Set(categories.map((c) => c.group));
    groups.delete('Transfers');
    return [...groups].sort();
  }, [categories]);

  // Build rows: debit + credit per category in date range
  const allRows = useMemo((): CategoryRow[] => {
    if (!transactions || !categories) return [];

    const inRange = transactions.filter(
      (t) =>
        !t.isTransfer &&
        t.date >= dateRange.from &&
        t.date <= dateRange.to
    );

    const spendMap = new Map<string, number>();
    const gainMap  = new Map<string, number>();
    const countMap = new Map<string, number>();

    for (const tx of inRange) {
      const key = tx.categoryId ?? '__uncategorised__';
      if (tx.amount < 0) {
        spendMap.set(key, (spendMap.get(key) ?? 0) + Math.abs(tx.amount));
      } else {
        gainMap.set(key, (gainMap.get(key) ?? 0) + tx.amount);
      }
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }

    const allKeys = new Set([...spendMap.keys(), ...gainMap.keys()]);

    return [...allKeys].map((id) => {
      const cat    = id === '__uncategorised__' ? null : categoryMap.get(id);
      const spend  = spendMap.get(id) ?? 0;
      const gain   = gainMap.get(id)  ?? 0;
      return {
        id,
        name:   id === '__uncategorised__' ? 'Uncategorised' : (cat?.name  ?? id),
        group:  id === '__uncategorised__' ? 'Other'         : (cat?.group ?? ''),
        colour: id === '__uncategorised__' ? '#6B7280'       : (cat?.colour ?? '#6B7280'),
        spend,
        gain,
        net:    spend - gain,
        count:  countMap.get(id) ?? 0,
      };
    });
  }, [transactions, categories, categoryMap, dateRange]);

  // Sorted rows (all, before exclusion filter)
  const sorted = useMemo(() => {
    const rows = [...allRows];
    rows.sort((a, b) => {
      const diff = a[sortCol] - b[sortCol];
      return sortDir === 'desc' ? -diff : diff;
    });
    return rows;
  }, [allRows, sortCol, sortDir]);

  // Visible rows = sorted minus excluded
  const visible = useMemo(
    () => sorted.filter((r) => !excluded.has(r.id)),
    [sorted, excluded]
  );

  // Grand totals from visible rows only (net ≥ 0 for % base)
  const visibleNetTotal = useMemo(
    () => visible.reduce((s, r) => s + Math.max(0, r.net), 0),
    [visible]
  );
  const grandSpend = useMemo(() => visible.reduce((s, r) => s + r.spend, 0), [visible]);
  const grandGain  = useMemo(() => visible.reduce((s, r) => s + r.gain,  0), [visible]);
  const grandNet   = useMemo(() => visible.reduce((s, r) => s + r.net,   0), [visible]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  function toggleExclude(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const name  = formName.trim();
    const group = formGroup.trim();
    if (!name)  { setError('Category name is required.'); return; }
    if (!group) { setError('Group is required.'); return; }
    const duplicate = (categories ?? []).some(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) { setError('A category with that name already exists.'); return; }
    setSaving(true);
    try {
      await createCategory({ name, group, colour: formColour, icon: 'Tag', isSystem: false });
      setFormName('');
      setFormGroup('');
      setFormColour(COLOUR_PALETTE[0]);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  function cancelForm() {
    setFormName('');
    setFormGroup('');
    setFormColour(COLOUR_PALETTE[0]);
    setError('');
    setShowForm(false);
  }

  const isEmpty = transactions !== undefined && transactions.length === 0;
  const hasRows = sorted.length > 0;

  return (
    <PageShell
      title="Categories"
      description="Spending breakdown by category"
      action={
        !showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-sm rounded-lg border border-primary/40 text-primary px-3 py-1.5 hover:bg-primary/10 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add category
          </button>
        ) : undefined
      }
    >
      {/* Create category form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 max-w-lg rounded-xl border border-border bg-card p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">New category</h3>
            <button type="button" onClick={cancelForm} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Pet Care"
              className="w-full text-sm bg-input border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Group (section)</label>
            <input
              type="text"
              list="group-suggestions"
              value={formGroup}
              onChange={(e) => setFormGroup(e.target.value)}
              placeholder="e.g. Health or My Custom Group"
              className="w-full text-sm bg-input border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <datalist id="group-suggestions">
              {existingGroups.map((g) => <option key={g} value={g} />)}
            </datalist>
            <p className="text-xs text-muted-foreground">
              Pick an existing group or type a new one to create it.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Colour</label>
            <div className="flex gap-2 flex-wrap">
              {COLOUR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFormColour(c)}
                  className="w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none"
                  style={{ backgroundColor: c }}
                >
                  {formColour === c && <Check className="w-3.5 h-3.5 text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 text-sm rounded-lg bg-primary text-primary-foreground px-4 py-2 font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Create category'}
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="text-sm rounded-lg border border-border px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <p className="text-muted-foreground text-sm">No data yet.</p>
          <LinkButton href="/upload" variant="outline" size="sm" className="gap-2">
            <Upload className="w-4 h-4" /> Upload statement
          </LinkButton>
        </div>
      ) : !hasRows ? (
        <p className="text-sm text-muted-foreground py-8">No transactions in this period.</p>
      ) : (
        <div className="space-y-3 max-w-3xl">

          {/* Hidden category pills + reset */}
          {excluded.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-muted-foreground">Excluded:</span>
              {[...excluded].map((id) => {
                const row = allRows.find((r) => r.id === id);
                return (
                  <button
                    key={id}
                    onClick={() => toggleExclude(id)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: row?.colour ?? '#6B7280' }}
                    />
                    {row?.name ?? id}
                    <X className="w-2.5 h-2.5 ml-0.5" />
                  </button>
                );
              })}
              <button
                onClick={() => setExcluded(new Set())}
                className="text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Show all
              </button>
            </div>
          )}

          {/* Table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                  <th className="text-left px-4 py-2.5 font-medium w-full">Category</th>
                  <SortHeader col="spend" current={sortCol} dir={sortDir} onSort={toggleSort}>
                    Spend
                  </SortHeader>
                  <SortHeader col="gain" current={sortCol} dir={sortDir} onSort={toggleSort}>
                    Gain
                  </SortHeader>
                  <SortHeader col="net" current={sortCol} dir={sortDir} onSort={toggleSort}>
                    Net
                  </SortHeader>
                  <th className="text-right px-4 py-2.5 font-medium whitespace-nowrap">%</th>
                  <th className="px-2 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
                  const isExcluded = excluded.has(row.id);
                  const pct = visibleNetTotal > 0 && !isExcluded
                    ? (Math.max(0, row.net) / visibleNetTotal) * 100
                    : 0;
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'border-b border-border/50 last:border-0',
                        isExcluded ? 'opacity-35' : 'hover:bg-muted/20'
                      )}
                    >
                      {/* Category name */}
                      <td className="px-4 py-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: row.colour }}
                            />
                            <span className="font-medium truncate">{row.name}</span>
                            <span className="text-xs text-muted-foreground hidden sm:inline">
                              {row.group}
                            </span>
                          </div>
                          {/* Progress bar */}
                          {!isExcluded && (
                            <div className="h-1 rounded-full bg-muted overflow-hidden max-w-[180px]">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, backgroundColor: row.colour }}
                              />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Spend */}
                      <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                        {row.spend > 0 ? (
                          <span className="amount-negative">{formatMoney(row.spend)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Gain */}
                      <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                        {row.gain > 0 ? (
                          <span className="amount-positive">{formatMoney(row.gain)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Net */}
                      <td className="px-4 py-3 text-right font-mono font-medium whitespace-nowrap">
                        <span className={row.net > 0 ? 'amount-negative' : row.net < 0 ? 'amount-positive' : 'text-muted-foreground'}>
                          {row.net === 0 ? '—' : formatMoney(Math.abs(row.net))}
                        </span>
                      </td>

                      {/* % */}
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {!isExcluded && pct > 0 ? `${pct.toFixed(1)}%` : '—'}
                      </td>

                      {/* Hide toggle */}
                      <td className="px-2 py-3 text-center">
                        <button
                          onClick={() => toggleExclude(row.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                          title={isExcluded ? 'Include in breakdown' : 'Exclude from breakdown'}
                        >
                          {isExcluded
                            ? <EyeOff className="w-3.5 h-3.5" />
                            : <Eye className="w-3.5 h-3.5" />
                          }
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Footer totals */}
              <tfoot>
                <tr className="border-t border-border bg-muted/20 text-xs font-medium">
                  <td className="px-4 py-2.5 text-muted-foreground">
                    Visible total
                    {excluded.size > 0 && (
                      <span className="ml-1 text-muted-foreground/60">
                        ({visible.length} of {sorted.length})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono amount-negative">
                    {formatMoney(grandSpend)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono amount-positive">
                    {formatMoney(grandGain)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">
                    <span className={grandNet > 0 ? 'amount-negative' : grandNet < 0 ? 'amount-positive' : ''}>
                      {formatMoney(Math.abs(grandNet))}
                    </span>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </PageShell>
  );
}

// ── Sort header helper ──────────────────────────────────────────────────────

function SortHeader({
  col,
  current,
  dir,
  onSort,
  children,
}: {
  col: SortCol;
  current: SortCol;
  dir: SortDir;
  onSort: (col: SortCol) => void;
  children: React.ReactNode;
}) {
  const active = col === current;
  return (
    <th className="px-4 py-2.5 font-medium whitespace-nowrap text-right">
      <button
        onClick={() => onSort(col)}
        className={cn(
          'flex items-center gap-1 ml-auto transition-colors',
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {children}
        {active ? (
          dir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </button>
    </th>
  );
}
