'use client';

import { useState, useRef, useEffect } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { useAppStore } from '@/lib/store/app-store';
import { monthStart, monthEnd } from '@/lib/utils/dates';
import { cn } from '@/lib/utils';

// Computed fresh each render so "This month" is always correct
function getPresets() {
  const y = new Date().getFullYear();
  return [
    { label: 'This month',    from: monthStart(0),  to: monthEnd(0) },
    { label: 'Last month',    from: monthStart(-1), to: monthEnd(-1) },
    { label: 'Last 3 months', from: monthStart(-2), to: monthEnd(0) },
    { label: 'Last 6 months', from: monthStart(-5), to: monthEnd(0) },
    { label: 'This year',     from: `${y}-01-01`,   to: `${y}-12-31` },
    { label: 'All time',      from: '2000-01-01',   to: '2099-12-31' },
  ];
}

export function Header() {
  const { dateRange, setDateRange } = useAppStore();
  const [open, setOpen]           = useState(false);
  const [customFrom, setCustomFrom] = useState(dateRange.from);
  const [customTo,   setCustomTo]   = useState(dateRange.to);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Keep custom inputs in sync when presets change from outside
  useEffect(() => {
    setCustomFrom(dateRange.from);
    setCustomTo(dateRange.to);
  }, [dateRange]);

  const presets     = getPresets();
  const activePreset = presets.find(p => p.from === dateRange.from && p.to === dateRange.to);
  const label       = activePreset?.label ?? `${dateRange.from} → ${dateRange.to}`;

  function selectPreset(from: string, to: string) {
    setDateRange({ from, to });
    setOpen(false);
  }

  function applyCustom() {
    if (customFrom && customTo && customFrom <= customTo) {
      setDateRange({ from: customFrom, to: customTo });
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
          {label}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>

        {/* Popover */}
        {open && (
          <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-border bg-popover shadow-xl p-3 space-y-0.5">
            {/* Presets */}
            {presets.map(p => (
              <button
                key={p.label}
                onClick={() => selectPreset(p.from, p.to)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                  dateRange.from === p.from && dateRange.to === p.to
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'hover:bg-accent text-foreground'
                )}
              >
                {p.label}
              </button>
            ))}

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
