'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Upload, Plus, X, Check } from 'lucide-react';
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

export default function CategoriesPage() {
  const { dateRange } = useAppStore();
  const [showForm, setShowForm]     = useState(false);
  const [formName, setFormName]     = useState('');
  const [formGroup, setFormGroup]   = useState('');
  const [formColour, setFormColour] = useState(COLOUR_PALETTE[0]);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

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

  // Group spend (debits only, no transfers) by category in date range
  const grouped = useMemo(() => {
    if (!transactions || !categories) return [];

    const inRange = transactions.filter(
      (t) =>
        !t.isTransfer &&
        t.amount < 0 &&
        t.date >= dateRange.from &&
        t.date <= dateRange.to
    );

    const totals = new Map<string, number>();
    const counts = new Map<string, number>();

    for (const tx of inRange) {
      const key = tx.categoryId ?? '__uncategorised__';
      totals.set(key, (totals.get(key) ?? 0) + Math.abs(tx.amount));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const rows = [...totals.entries()]
      .map(([id, total]) => ({
        id,
        category: id === '__uncategorised__' ? null : categoryMap.get(id),
        name: id === '__uncategorised__'
          ? 'Uncategorised'
          : (categoryMap.get(id)?.name ?? id),
        group: id === '__uncategorised__'
          ? 'Other'
          : (categoryMap.get(id)?.group ?? ''),
        colour: id === '__uncategorised__'
          ? '#6B7280'
          : (categoryMap.get(id)?.colour ?? '#6B7280'),
        total,
        count: counts.get(id) ?? 0,
      }))
      .sort((a, b) => b.total - a.total);

    return rows;
  }, [transactions, categories, categoryMap, dateRange]);

  const grandTotal = useMemo(
    () => grouped.reduce((s, r) => s + r.total, 0),
    [grouped]
  );

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

          {/* Name */}
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

          {/* Group */}
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
              {existingGroups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">
              Pick an existing group or type a new one to create it.
            </p>
          </div>

          {/* Colour */}
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
      ) : grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8">No spending in this period.</p>
      ) : (
        <div className="space-y-2 max-w-2xl">
          {grouped.map((row) => {
            const pct = grandTotal > 0 ? (row.total / grandTotal) * 100 : 0;
            return (
              <div key={row.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: row.colour }}
                    />
                    <span className="text-sm font-medium truncate">{row.name}</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {row.group}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-medium amount-negative">
                      {formatMoney(row.total)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.count} txn{row.count !== 1 ? 's' : ''} · {pct.toFixed(1)}%
                    </p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: row.colour }}
                  />
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between pt-2 px-1 text-sm font-medium">
            <span className="text-muted-foreground">Total spend</span>
            <span className="font-mono amount-negative">{formatMoney(grandTotal)}</span>
          </div>
        </div>
      )}
    </PageShell>
  );
}
