'use client';

import { Upload, AlertCircle, ArrowRight, TrendingUp, DollarSign, PiggyBank } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import Link from 'next/link';

export default function DashboardPage() {
  return (
    <PageShell title="Dashboard" description="Your financial overview">
      <div className="space-y-6">
        {/* Empty state */}
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <PiggyBank className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">No data yet</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Import your first bank statement to see spending insights, budget tracking, and savings analysis.
            </p>
          </div>
          <LinkButton href="/upload" className="gap-2">
            <Upload className="w-4 h-4" />
            Upload bank statement
          </LinkButton>
        </div>

        {/* Placeholder stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Spent this month', icon: DollarSign, value: '—' },
            { label: 'Savings rate',     icon: TrendingUp,  value: '—' },
            { label: 'Needs review',     icon: AlertCircle, value: '—' },
          ].map(({ label, icon: Icon, value }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm text-muted-foreground font-medium">{label}</CardTitle>
                <Icon className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-mono">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link href="/upload" className="group flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors">
            <div className="flex items-center gap-3">
              <Upload className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Upload statement</p>
                <p className="text-xs text-muted-foreground">CSV or QIF from any NZ bank</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </Link>
          <Link href="/review" className="group flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-warning" />
              <div>
                <p className="text-sm font-medium">Review queue</p>
                <p className="text-xs text-muted-foreground">Categorise uncategorised transactions</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
