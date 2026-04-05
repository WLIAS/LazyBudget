'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
interface ColumnMapperProps {
  headers: string[];
  mapping: { date: string | null; amount: string | null; payee: string | null; description: string | null };
  onChange: (field: keyof ColumnMapperProps['mapping'], value: string) => void;
}

const FIELDS: { key: keyof ColumnMapperProps['mapping']; label: string; required: boolean }[] = [
  { key: 'date',        label: 'Date column',        required: true },
  { key: 'amount',      label: 'Amount column',      required: true },
  { key: 'payee',       label: 'Payee/Description',  required: false },
  { key: 'description', label: 'Memo/Reference',     required: false },
];

// Minimal Label component for internal use
function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={`text-sm font-medium ${className ?? ''}`}>{children}</label>;
}

export function ColumnMapper({ headers, mapping, onChange }: ColumnMapperProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold">Map columns</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          We couldn't auto-detect your bank format. Please map the columns manually.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FIELDS.map(({ key, label, required }) => (
          <div key={key} className="space-y-1.5">
            <Label>
              {label}
              {required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Select
              value={mapping[key] ?? ''}
              onValueChange={(val) => { if (val) onChange(key, val); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select column…" />
              </SelectTrigger>
              <SelectContent>
                {headers.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}
