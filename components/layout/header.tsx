'use client';

import { CalendarDays, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { buttonVariants } from '@/components/ui/button';
import { useAppStore } from '@/lib/store/app-store';
import { monthStart, monthEnd } from '@/lib/utils/dates';
import { cn } from '@/lib/utils';

const PRESETS = [
  { label: 'This month',    from: monthStart(0),  to: monthEnd(0) },
  { label: 'Last month',    from: monthStart(-1), to: monthEnd(-1) },
  { label: 'Last 3 months', from: monthStart(-2), to: monthEnd(0) },
  { label: 'Last 6 months', from: monthStart(-5), to: monthEnd(0) },
  { label: 'This year',
    from: new Date().getFullYear() + '-01-01',
    to:   new Date().getFullYear() + '-12-31' },
];

export function Header() {
  const { dateRange, setDateRange } = useAppStore();

  const label =
    PRESETS.find((p) => p.from === dateRange.from && p.to === dateRange.to)
      ?.label ?? `${dateRange.from} → ${dateRange.to}`;

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/60 backdrop-blur sticky top-0 z-40">
      <div className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'gap-2 text-sm'
          )}
        >
          <CalendarDays className="w-4 h-4" />
          {label}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {PRESETS.map((p) => (
            <DropdownMenuItem
              key={p.label}
              onClick={() => setDateRange({ from: p.from, to: p.to })}
            >
              {p.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
