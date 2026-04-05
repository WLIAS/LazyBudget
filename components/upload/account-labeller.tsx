'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import type { Account } from '@/lib/db/schema';

interface AccountLabellerProps {
  accounts: Account[];
  selectedAccountId: string | null;
  onSelect: (id: string) => void;
  onCreate: (data: { name: string; label: Account['label']; bankName: string }) => void;
}

const LABEL_OPTIONS: { value: Account['label']; label: string }[] = [
  { value: 'spending',    label: 'Spending / Everyday' },
  { value: 'bills',       label: 'Bills' },
  { value: 'savings',     label: 'Savings' },
  { value: 'mortgage',    label: 'Mortgage' },
  { value: 'investment',  label: 'Investment' },
  { value: 'other',       label: 'Other' },
];

export function AccountLabeller({
  accounts,
  selectedAccountId,
  onSelect,
  onCreate,
}: AccountLabellerProps) {
  const [mode, setMode] = useState<'existing' | 'new'>(
    accounts.length === 0 ? 'new' : 'existing'
  );
  const [name, setName] = useState('');
  const [label, setLabel] = useState<Account['label']>('spending');
  const [bankName, setBankName] = useState('');

  // Notify parent when new form changes
  useEffect(() => {
    if (mode === 'new' && name.trim()) {
      onCreate({ name: name.trim(), label, bankName: bankName.trim() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, label, bankName, mode]);

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <h3 className="font-semibold">Account</h3>

      {accounts.length > 0 && (
        <div className="flex gap-3">
          <button
            onClick={() => setMode('existing')}
            className={`text-sm px-3 py-1 rounded-md border transition-colors ${
              mode === 'existing'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            Use existing
          </button>
          <button
            onClick={() => setMode('new')}
            className={`text-sm px-3 py-1 rounded-md border transition-colors ${
              mode === 'new'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            New account
          </button>
        </div>
      )}

      {mode === 'existing' ? (
        <select
          value={selectedAccountId ?? ''}
          onChange={(e) => { if (e.target.value) onSelect(e.target.value); }}
          className="w-full text-sm bg-input border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="" disabled>Select account…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      ) : (
        <div className="space-y-3">
          <Input
            placeholder="Account name (e.g. ASB Everyday)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            value={label}
            onChange={(e) => setLabel(e.target.value as Account['label'])}
            className="w-full text-sm bg-input border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {LABEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Input
            placeholder="Bank name (optional, e.g. ASB)"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
