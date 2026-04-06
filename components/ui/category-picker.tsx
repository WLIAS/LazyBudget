'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Category } from '@/lib/db/schema';

interface CategoryPickerProps {
  categories: Category[];
  value?: string | null;
  onChange: (categoryId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function CategoryPicker({
  categories,
  value,
  onChange,
  placeholder = 'Pick category…',
  disabled,
  className,
}: CategoryPickerProps) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const containerRef        = useRef<HTMLDivElement>(null);
  const searchRef           = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 10);
  }, [open]);

  const selected = value ? categories.find((c) => c.id === value) : null;

  const groups = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = categories.filter(
      (c) =>
        c.name !== 'Internal Transfer' &&
        c.name !== 'Uncategorised' &&
        (!q || c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q))
    );
    const map = new Map<string, Category[]>();
    for (const cat of filtered) {
      if (!map.has(cat.group)) map.set(cat.group, []);
      map.get(cat.group)!.push(cat);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [categories, search]);

  function select(categoryId: string) {
    onChange(categoryId);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center justify-between gap-1.5 w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-input text-foreground focus:outline-none focus:ring-1 focus:ring-ring',
          disabled && 'opacity-50 cursor-not-allowed',
          open && 'ring-1 ring-ring'
        )}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-[640px] rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
          {/* Search */}
          <div className="p-2.5 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-sm bg-input border border-border rounded-md pl-7 pr-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Category grid — CSS columns so groups flow naturally */}
          <div className="p-3">
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground px-2 py-2">No categories found</p>
            ) : (
              <div style={{ columns: '3', columnGap: '0' }}>
                {groups.map(([group, cats]) => (
                  <div key={group} style={{ breakInside: 'avoid' }} className="mb-3 pr-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-1 pb-1">
                      {group}
                    </p>
                    {cats.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => select(cat.id)}
                        className={cn(
                          'w-full text-left text-sm px-2 py-1.5 rounded-md transition-colors flex items-center justify-between gap-2 hover:bg-accent hover:text-accent-foreground cursor-pointer',
                          value === cat.id && 'text-primary font-medium bg-primary/5'
                        )}
                      >
                        <span>{cat.name}</span>
                        {value === cat.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
