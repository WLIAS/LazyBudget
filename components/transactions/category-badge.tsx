'use client';

import type { Category } from '@/lib/db/schema';
import { cn } from '@/lib/utils';

interface CategoryBadgeProps {
  category?: Category;
  source?: string | null;
  className?: string;
}

export function CategoryBadge({ category, source, className }: CategoryBadgeProps) {
  if (!category) {
    return (
      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground', className)}>
        Uncategorised
      </span>
    );
  }

  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', className)}
      style={{ backgroundColor: category.colour + '22', color: category.colour }}
    >
      {category.name}
      {source === 'ai' && (
        <span className="opacity-60 text-[10px]">AI</span>
      )}
    </span>
  );
}
