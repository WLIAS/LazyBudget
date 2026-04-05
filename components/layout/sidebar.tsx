'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Upload,
  List,
  AlertCircle,
  Tag,
  PiggyBank,
  Wallet,
  TrendingUp,
  Settings,
} from 'lucide-react';
import { useAppStore } from '@/lib/store/app-store';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/',             label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/upload',       label: 'Upload',       icon: Upload },
  { href: '/transactions', label: 'Transactions', icon: List },
  { href: '/review',       label: 'Review',       icon: AlertCircle, badge: true },
  { href: '/categories',   label: 'Categories',   icon: Tag },
  { href: '/budget',       label: 'Budget',       icon: PiggyBank },
  { href: '/accounts',     label: 'Accounts',     icon: Wallet },
  { href: '/savings',      label: 'Savings',      icon: TrendingUp },
  { href: '/settings',    label: 'Settings',     icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const reviewCount = useAppStore((s) => s.reviewCount);

  return (
    <aside className="hidden md:flex flex-col w-56 min-h-screen bg-[#080D18] border-r border-border shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5 border-b border-border">
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
          <span className="text-xs font-bold text-primary-foreground">LB</span>
        </div>
        <span className="font-bold text-[15px] tracking-tight">LazyBudget</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors relative',
                active
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
              )}
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
              {badge && reviewCount > 0 && (
                <span className="ml-auto text-[11px] font-semibold bg-warning text-black rounded-full px-1.5 py-0.5 leading-none">
                  {reviewCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-border">
        <p className="text-xs text-muted-foreground">All data stored locally</p>
        <p className="text-[11px] text-muted-foreground/50 mt-0.5">v0.3.2</p>
      </div>
    </aside>
  );
}

/** Mobile bottom tab bar */
export function MobileNav() {
  const pathname = usePathname();
  const MOBILE_ITEMS = NAV_ITEMS.slice(0, 5);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex bg-[#080D18] border-t border-border">
      {MOBILE_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center gap-1 py-2 text-[10px]',
              active ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
