'use client';

import { useEffect } from 'react';
import { seedDefaultCategories } from '@/lib/db/categories';

/** Runs the category seed on every app load (bulkPut is idempotent). */
export function DbSeed() {
  useEffect(() => {
    seedDefaultCategories().catch((e) =>
      console.error('[LazyBudget] seedDefaultCategories failed:', e)
    );
  }, []);

  return null;
}
