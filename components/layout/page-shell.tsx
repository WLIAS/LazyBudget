import { ReactNode } from 'react';

interface PageShellProps {
  title: string;
  description?: string;
  action?: ReactNode;
  badge?: string;
  children: ReactNode;
}

export function PageShell({ title, description, action, badge, children }: PageShellProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 py-5 flex items-start justify-between gap-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            {badge && (
              <span className="text-[11px] font-mono text-muted-foreground/60 bg-muted/50 border border-border rounded px-1.5 py-0.5 leading-none">
                {badge}
              </span>
            )}
          </div>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="flex-1 px-6 py-6 overflow-auto">{children}</div>
    </div>
  );
}
