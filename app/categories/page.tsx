'use client';

import { Tag, Upload } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { LinkButton } from '@/components/ui/link-button';

export default function CategoriesPage() {
  return (
    <PageShell title="Categories" description="Spending breakdown by category">
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <Tag className="w-7 h-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="font-semibold">No data yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Category breakdowns will appear once you have imported and categorised transactions.
          </p>
        </div>
        <LinkButton href="/upload" variant="outline" size="sm" className="gap-2">
          <Upload className="w-4 h-4" /> Upload statement
        </LinkButton>
      </div>
    </PageShell>
  );
}
