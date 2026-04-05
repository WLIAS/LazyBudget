'use client';

import { useState, useCallback } from 'react';
import { CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { PageShell } from '@/components/layout/page-shell';
import { Dropzone } from '@/components/upload/dropzone';
import { ColumnMapper } from '@/components/upload/column-mapper';
import { AccountLabeller } from '@/components/upload/account-labeller';
import { UploadPreview } from '@/components/upload/upload-preview';
import { Button } from '@/components/ui/button';
import { LinkButton } from '@/components/ui/link-button';
import { parseCSV } from '@/lib/parsers/csv';
import { parseQIFFile } from '@/lib/parsers/qif';
import { normaliseCSVRows, normaliseQIFEntries } from '@/lib/parsers/normaliser';
import { addTransactions } from '@/lib/db/transactions';
import { getAccounts, createAccount } from '@/lib/db/accounts';
import { getDB } from '@/lib/db/index';
import { seedDefaultCategories } from '@/lib/db/categories';
import type { Transaction, Account } from '@/lib/db/schema';

type Step = 'drop' | 'map' | 'account' | 'preview' | 'importing' | 'done';

interface NewAccountData {
  name: string;
  label: Account['label'];
  bankName: string;
}

export default function UploadPage() {
  const [step, setStep] = useState<Step>('drop');
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<{
    date: string | null;
    amount: string | null;
    payee: string | null;
    description: string | null;
  }>({ date: null, amount: null, payee: null, description: null });
  const [isMappingGeneric, setIsMappingGeneric] = useState(false);
  const [parsedTxs, setParsedTxs] = useState<Omit<Transaction, 'id' | 'createdAt'>[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [newAccountData, setNewAccountData] = useState<NewAccountData | null>(null);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (f: File) => {
    setError(null);
    setFile(f);
    try {
      // Ensure categories are seeded
      await seedDefaultCategories();
      // Load accounts
      const accs = await getAccounts();
      setAccounts(accs);

      const batchId = uuidv4();
      const isQIF = f.name.toLowerCase().endsWith('.qif');

      if (isQIF) {
        const entries = await parseQIFFile(f);
        const txs = normaliseQIFEntries(entries, '__pending__', batchId);
        setParsedTxs(txs);
        setStep(accs.length === 0 ? 'account' : 'account');
      } else {
        const result = await parseCSV(f);
        setHeaders(result.headers);
        setMapping(result.mapping);
        setIsMappingGeneric(result.isMappingGeneric);

        if (result.isMappingGeneric && (!result.mapping.date || !result.mapping.amount)) {
          setStep('map');
        } else {
          const txs = normaliseCSVRows(result.rows, '__pending__', batchId, result.bankProfile);
          setParsedTxs(txs);
          setStep('account');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse file');
    }
  }, []);

  const handleMappingConfirm = useCallback(async () => {
    if (!file) return;
    try {
      const batchId = uuidv4();
      const result = await parseCSV(file, {
        date: mapping.date ?? '',
        amount: mapping.amount ?? '',
        payee: mapping.payee ?? '',
        description: mapping.description ?? '',
      });
      const txs = normaliseCSVRows(result.rows, '__pending__', batchId);
      setParsedTxs(txs);
      setStep('account');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mapping failed');
    }
  }, [file, mapping]);

  const handleAccountContinue = useCallback(() => {
    if (!selectedAccountId && !newAccountData?.name) {
      setError('Please select or create an account');
      return;
    }
    setError(null);
    setStep('preview');
  }, [selectedAccountId, newAccountData]);

  const handleImport = useCallback(async () => {
    setStep('importing');
    setError(null);
    try {
      let accountId = selectedAccountId;

      if (!accountId && newAccountData?.name) {
        const acc = await createAccount({
          name: newAccountData.name,
          label: newAccountData.label,
          bankName: newAccountData.bankName,
          currency: 'NZD',
        });
        accountId = acc.id;
      }

      if (!accountId) {
        setError('No account selected');
        setStep('account');
        return;
      }

      const batchId = parsedTxs[0]?.importBatchId ?? uuidv4();
      const txsWithAccount = parsedTxs.map((t) => ({
        ...t,
        accountId,
        importBatchId: batchId,
      }));

      // Save import batch
      const dates = txsWithAccount.map((t) => t.date).sort();
      await getDB().importBatches.add({
        id: batchId,
        fileName: file?.name ?? 'unknown',
        accountId: accountId!,
        transactionCount: txsWithAccount.length,
        dateRange: { from: dates[0] ?? '', to: dates[dates.length - 1] ?? '' },
        importedAt: new Date().toISOString(),
      });

      const result = await addTransactions(txsWithAccount);
      setImportResult(result);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
      setStep('preview');
    }
  }, [selectedAccountId, newAccountData, parsedTxs, file]);

  const reset = () => {
    setStep('drop');
    setFile(null);
    setHeaders([]);
    setMapping({ date: null, amount: null, payee: null, description: null });
    setParsedTxs([]);
    setSelectedAccountId(null);
    setNewAccountData(null);
    setImportResult(null);
    setError(null);
  };

  return (
    <PageShell
      title="Upload"
      description="Import your bank statement to get started"
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {(['drop', 'account', 'preview'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <span>→</span>}
              <span
                className={
                  step === s || (s === 'drop' && step === 'map')
                    ? 'text-foreground font-medium'
                    : step === 'done' || (i === 0 && ['account','preview','importing','done'].includes(step))
                    ? 'line-through opacity-40'
                    : ''
                }
              >
                {s === 'drop' ? 'Upload file' : s === 'account' ? 'Select account' : 'Preview & import'}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {step === 'drop' && <Dropzone onFile={handleFile} />}

        {step === 'map' && (
          <div className="space-y-4">
            <ColumnMapper
              headers={headers}
              mapping={mapping}
              onChange={(field, value) => setMapping((m) => ({ ...m, [field]: value }))}
            />
            <Button
              onClick={handleMappingConfirm}
              disabled={!mapping.date || !mapping.amount}
            >
              Continue
            </Button>
          </div>
        )}

        {step === 'account' && (
          <div className="space-y-4">
            <AccountLabeller
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              onSelect={setSelectedAccountId}
              onCreate={(data) => {
                setNewAccountData(data);
                setSelectedAccountId(null);
              }}
            />
            <Button onClick={handleAccountContinue}>
              Continue to preview
            </Button>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <UploadPreview transactions={parsedTxs} />
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {parsedTxs.length} transactions ready to import
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('account')}>
                  Back
                </Button>
                <Button onClick={handleImport}>
                  Import {parsedTxs.length} transactions
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Importing transactions…</p>
          </div>
        )}

        {step === 'done' && importResult && (
          <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-4">
            <CheckCircle2 className="w-12 h-12 text-[#34D399]" />
            <div>
              <h2 className="text-lg font-semibold">Import complete</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {importResult.added} transactions added
                {importResult.skipped > 0 && `, ${importResult.skipped} duplicates skipped`}
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={reset}>
                Import another file
              </Button>
              <LinkButton href="/transactions">View transactions</LinkButton>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
