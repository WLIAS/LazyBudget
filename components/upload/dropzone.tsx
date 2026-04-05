'use client';

import { useCallback, useState } from 'react';
import { Upload, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DropzoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function Dropzone({ onFile, disabled }: DropzoneProps) {
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'csv' && ext !== 'qif') {
        alert('Only .csv and .qif files are supported');
        return;
      }
      onFile(file);
    },
    [onFile]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 transition-colors',
        dragging
          ? 'border-primary bg-primary/5'
          : 'border-border bg-card hover:border-primary/50',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
        <Upload className="w-6 h-6 text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="font-medium">Drop your bank export here</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Supports .csv and .qif — ASB, ANZ, BNZ, Westpac, Kiwibank
        </p>
      </div>
      <label className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
        Browse files
        <input
          type="file"
          accept=".csv,.qif"
          className="sr-only"
          onChange={onInputChange}
          disabled={disabled}
        />
      </label>
    </div>
  );
}
