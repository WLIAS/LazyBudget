'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
        <Select value={selectedAccountId ?? ''} onValueChange={(v) => { if (v) onSelect(v); }}>
          <SelectTrigger>
            <SelectValue placeholder="Select account…" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="space-y-3">
          <Input
            placeholder="Account name (e.g. ASB Everyday)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select value={label} onValueChange={(v) => setLabel(v as Account['label'])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LABEL_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
