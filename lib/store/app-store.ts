// lib/store/app-store.ts — Zustand store for UI state

import { create } from 'zustand';

export type DateRange = {
  from: string;  // ISO YYYY-MM-DD
  to: string;
};

function thisMonthRange(): DateRange {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  return { from, to };
}

interface AppState {
  // Global date range filter
  dateRange: DateRange;
  dateRangeLabel: string;
  setDateRange: (range: DateRange, label?: string) => void;

  // Currently selected account (null = all)
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;

  // Upload state
  uploadStep: 'idle' | 'parsing' | 'mapping' | 'preview' | 'importing' | 'done';
  setUploadStep: (step: AppState['uploadStep']) => void;

  // Review queue count (cached for sidebar badge)
  reviewCount: number;
  setReviewCount: (n: number) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  dateRange: thisMonthRange(),
  dateRangeLabel: 'This month',
  setDateRange: (range, label) => set({ dateRange: range, dateRangeLabel: label ?? `${range.from} → ${range.to}` }),

  selectedAccountId: null,
  setSelectedAccountId: (id) => set({ selectedAccountId: id }),

  uploadStep: 'idle',
  setUploadStep: (step) => set({ uploadStep: step }),

  reviewCount: 0,
  setReviewCount: (n) => set({ reviewCount: n }),
}));
