'use client';

import { useState, useRef, useEffect } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { useAppStore } from '@/lib/store/app-store';
import { monthStart, monthEnd } from '@/lib/utils/dates';
import { cn } from '@/lib/utils';

type Period = 'days' | 'weeks' | 'months' | 'years';

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function calcLastN(n: number, period: Period): string {
  const from = new Date();
  switch (period) {
    case 'days':   from.setDate(from.getDate() - n); break;
    case 'weeks':  from.setDate(from.getDate() - n * 7); break;
    case 'months': from.setMonth(from.getMonth() - n); break;
    case 'years':  from.setFullYear(from.getFullYear() - n); break;
  }
  return toISO(from);
}

const PERIOD_LABELS: Record<Period, string> = {
  days: 'Days', weeks: 'Weeks', months: 'Months', years: 'Years',
};

export function Header() {
  const { dateRange, dateRangeLabel, setDateRange } = useAppStore();
  const [open, setOpen]     = useState(false);
  const [lastN, setLastN]   = useState(3);
  const [period, setPeriod] = useState<Period>('months');
  const [customFrom, setCustomFrom] = useState(dateRange.from);
  const [customTo,   setCustomTo]   = useState(dateRange.to);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    setCustomFrom(dateRange.from);
    setCustomTo(dateRange.to);
  }, [dateRange]);

  const y = new Date().getFullYear();

  const presets = [
    { label: 'This month', from: monthStart(0),   to: monthEnd(0) },
    { label: 'Last month', from: monthStart(-1),  to: monthEnd(-1) },
    { label: 'Last year',  from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
  ];

  function selectPreset(from: string, to: string, label: string) {
    setDateRange({ from, to }, label);
    setOpen(false);
  }

  function applyLastN() {
    const n = Math.max(1, Math.min(9999, lastN || 1));
    const from = calcLastN(n, period);
    const to   = toISO(new Date());
    const label = `Last ${n} ${PERIOD_LABELS[period].toLowerCase()}`;
    setDateRange({ from, to }, label);
    setOpen(false);
  }

  function applyCustom() {
    if (customFrom && customTo && customFrom <= customTo) {
      setDateRange({ from: customFrom, to: customTo }, `${customFrom} → ${customTo}`);
      setOpen(false);
    }
  }

  return (
    <header className="flex items-center justify-end px-6 py-3 border-b border-border bg-card/60 backdrop-blur sticky top-0 z-40">
      <div className="relative" ref={containerRef}>
        {/* Trigger */}
        <button
          onClick={() => setOpen(v => !v)}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2 text-sm')}
        >
          <CalendarDays className="w-4 h-4" />
          {dateRangeLabel}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>

        {/* Popover */}
        {open && (
          <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl border border-border bg-popover shadow-xl p-3 space-y-0.5">

            {/* Presets */}
            {presets.map(p => (
              <button
                key={p.label}
                onClick={() => selectPreset(p.from, p.to, p.label)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                  dateRangeLabel === p.label
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'hover:bg-accent text-foreground'
                )}
              >
                {p.label}
              </button>
            ))}

            {/* Last N Period */}
            <div className="pt-2 mt-1 border-t border-border space-y-2">
              <p className="text-xs font-medium text-muted-foreground px-1">Last…</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={lastN}
                  onChange={e => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v)) setLastN(Math.max(1, Math.min(9999, v)));
                  }}
                  className="w-20 text-sm bg-input border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <select
                  value={period}
                  onChange={e => setPeriod(e.target.value as Period)}
                  className="flex-1 text-sm bg-input border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                  <option value="months">Months</option>
                  <option value="years">Years</option>
                </select>
                <button
                  onClick={applyLastN}
                  className="text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors whitespace-nowrap"
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Custom range */}
            <div className="pt-2 mt-1 border-t border-border space-y-2">
              <p className="text-xs font-medium text-muted-foreground px-1">Custom range</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground px-1">From</p>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="w-full text-xs bg-input border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground px-1">To</p>
                  <input
                    type="date"
                    value={customTo}
                    onChange={e => setCustomTo(e.target.value)}
                    className="w-full text-xs bg-input border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
              <button
                onClick={applyCustom}
                disabled={!customFrom || !customTo || customFrom > customTo}
                className="w-full text-sm py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Apply
              </button>
            </div>

          </div>
        )}
      </div>
    </header>
  );
}
