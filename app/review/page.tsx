'use client';

import { AlertCircle, Upload } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { LinkButton } from '@/components/ui/link-button';

export default function ReviewPage() {
  return (
    <PageShell title="Review" description="Transactions needing categorisation">
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <AlertCircle className="w-7 h-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="font-semibold">Queue is empty</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            All transactions are categorised — or import more data to get started.
          </p>
        </div>
        <LinkButton href="/upload" variant="outline" size="sm" className="gap-2">
          <Upload className="w-4 h-4" /> Upload statement
        </LinkButton>
      </div>
    </PageShell>
  );
}
