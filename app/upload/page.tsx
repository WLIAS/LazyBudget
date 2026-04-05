'use client';

import { useState, useCallback } from 'react';
import { CheckCircle2, Loader2, AlertTriangle, FileText, ChevronRight } from 'lucide-react';
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
import { runCategorisation, type EngineProgress, type EngineResult } from '@/lib/categorisation/engine';
import type { Transaction, Account } from '@/lib/db/schema';
import type { BankProfile } from '@/lib/parsers/bank-profiles';

type Step = 'drop' | 'map' | 'account' | 'preview' | 'importing' | 'categorising' | 'done';

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
  const [bankProfile, setBankProfile] = useState<BankProfile | null>(null);
  const [isQIF, setIsQIF] = useState(false);
  const [parsedTxs, setParsedTxs] = useState<Omit<Transaction, 'id' | 'createdAt'>[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [newAccountData, setNewAccountData] = useState<NewAccountData | null>(null);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null);
  const [catProgress, setCatProgress] = useState<EngineProgress | null>(null);
  const [catResult, setCatResult] = useState<EngineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (f: File) => {
    setError(null);
    setFile(f);

    try {
      // Seed categories (idempotent upsert — safe to call every time)
      await seedDefaultCategories();
    } catch (e) {
      console.error('[LazyBudget] seedDefaultCategories failed:', e);
      // Non-fatal — continue without seeding
    }

    try {
      const accs = await getAccounts();
      setAccounts(accs);

      const qif = f.name.toLowerCase().endsWith('.qif');
      setIsQIF(qif);

      if (qif) {
        const entries = await parseQIFFile(f);
        console.log('[LazyBudget] QIF parsed:', entries.length, 'entries from', f.name);
        if (entries.length === 0) {
          setError('No transactions found in this QIF file. Check that it contains bank transactions (D/T/P/M fields).');
          return;
        }
        const batchId = uuidv4();
        const txs = normaliseQIFEntries(entries, '__pending__', batchId);
        setParsedTxs(txs);
        setStep('account');
      } else {
        const result = await parseCSV(f);
        setHeaders(result.headers);
        setMapping(result.mapping);
        setBankProfile(result.bankProfile);
        console.log('[LazyBudget] CSV parsed:', result.rows.length, 'rows, bank:', result.bankProfile?.name ?? 'generic');
        // Always show column mapper so user can review/adjust detected columns
        setStep('map');
      }
    } catch (e) {
      console.error('[LazyBudget] File parse error:', e);
      setError(e instanceof Error ? e.message : 'Failed to parse file. Try a different file or format.');
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
      const txs = normaliseCSVRows(result.rows, '__pending__', batchId, bankProfile ?? undefined);
      setParsedTxs(txs);
      setStep('account');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Column mapping failed');
    }
  }, [file, mapping, bankProfile]);

  const handleAccountContinue = useCallback(() => {
    if (!selectedAccountId && !newAccountData?.name) {
      setError('Please select an existing account or enter a name for a new one.');
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
        accountId: accountId!,
        importBatchId: batchId,
      }));

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
      console.log('[LazyBudget] Import result:', result);
      setImportResult(result);

      // Run categorisation pipeline
      setStep('categorising');
      try {
        const engineResult = await runCategorisation(batchId, (p) => setCatProgress(p));
        setCatResult(engineResult);
      } catch (e) {
        console.error('[LazyBudget] Categorisation error:', e);
        // Non-fatal — still show done screen
      }

      setStep('done');
    } catch (e) {
      console.error('[LazyBudget] Import error:', e);
      setError(e instanceof Error ? e.message : 'Import failed');
      setStep('preview');
    }
  }, [selectedAccountId, newAccountData, parsedTxs, file]);

  const reset = () => {
    setStep('drop');
    setFile(null);
    setHeaders([]);
    setMapping({ date: null, amount: null, payee: null, description: null });
    setBankProfile(null);
    setIsQIF(false);
    setParsedTxs([]);
    setSelectedAccountId(null);
    setNewAccountData(null);
    setImportResult(null);
    setCatProgress(null);
    setCatResult(null);
    setError(null);
  };

  return (
    <PageShell
      title="Upload"
      description="Import your bank statement to get started"
    >
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Step breadcrumb */}
        {step !== 'done' && step !== 'importing' && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
            {(isQIF
              ? (['drop', 'account', 'preview'] as const)
              : (['drop', 'map', 'account', 'preview'] as const)
            ).map((s, i) => {
              const labels: Record<string, string> = {
                drop: 'Upload file', map: 'Map columns',
                account: 'Select account', preview: 'Preview & import',
              };
              const order = isQIF
                ? ['drop', 'account', 'preview']
                : ['drop', 'map', 'account', 'preview'];
              const currentIdx = order.indexOf(step);
              const thisIdx = order.indexOf(s);
              const isActive = step === s;
              const isDone = thisIdx < currentIdx;
              return (
                <span key={s} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="w-3 h-3 opacity-40" />}
                  <span className={
                    isActive ? 'text-foreground font-medium' :
                    isDone ? 'line-through opacity-40' : 'opacity-40'
                  }>
                    {labels[s]}
                  </span>
                </span>
              );
            })}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP: Drop */}
        {step === 'drop' && <Dropzone onFile={handleFile} />}

        {/* STEP: Column mapping (CSV only) */}
        {step === 'map' && (
          <div className="space-y-4">
            {file && (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                <FileText className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {bankProfile ? `Detected: ${bankProfile.name}` : 'Confirm the column mapping below'}
                  </p>
                </div>
                {bankProfile && <span className="text-xs text-[#34D399] font-medium">Auto-detected ✓</span>}
              </div>
            )}
            <ColumnMapper
              headers={headers}
              mapping={mapping}
              onChange={(field, value) => setMapping((m) => ({ ...m, [field]: value }))}
            />
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setStep('drop')}>Back</Button>
              <Button
                onClick={handleMappingConfirm}
                disabled={!mapping.date || !mapping.amount}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* STEP: Account selection */}
        {step === 'account' && (
          <div className="space-y-4">
            {/* Parsed file summary */}
            {file && parsedTxs.length > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                <FileText className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {parsedTxs.length.toLocaleString()} transactions found
                  </p>
                </div>
                <span className="text-xs text-[#34D399] font-medium">Parsed ✓</span>
              </div>
            )}
            <AccountLabeller
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              onSelect={(id) => { setSelectedAccountId(id); setNewAccountData(null); }}
              onCreate={(data) => { setNewAccountData(data); setSelectedAccountId(null); }}
            />
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setStep(isQIF ? 'drop' : 'map')}>Back</Button>
              <Button onClick={handleAccountContinue}>
                Preview {parsedTxs.length.toLocaleString()} transactions
              </Button>
            </div>
          </div>
        )}

        {/* STEP: Preview */}
        {step === 'preview' && (
          <div className="space-y-4">
            <UploadPreview transactions={parsedTxs} />
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {parsedTxs.length.toLocaleString()} transactions ready to import
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('account')}>
                  Back
                </Button>
                <Button onClick={handleImport}>
                  Import {parsedTxs.length.toLocaleString()} transactions
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* STEP: Importing */}
        {step === 'importing' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Importing {parsedTxs.length.toLocaleString()} transactions…
            </p>
          </div>
        )}

        {/* STEP: Categorising */}
        {step === 'categorising' && (
          <div className="flex flex-col items-center gap-5 py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">
                {catProgress?.phase === 'ai' ? 'AI categorising…' : 'Applying rules…'}
              </p>
              {catProgress && catProgress.total > 0 && (
                <p className="text-xs text-muted-foreground">
                  {catProgress.done.toLocaleString()} / {catProgress.total.toLocaleString()} transactions
                </p>
              )}
            </div>
            {catProgress && catProgress.total > 0 && (
              <div className="w-64 bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((catProgress.done / catProgress.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* STEP: Done */}
        {step === 'done' && importResult && (
          <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-5">
            <CheckCircle2 className="w-12 h-12 text-[#34D399]" />
            <div>
              <h2 className="text-lg font-semibold">Import complete</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="text-foreground font-medium">{importResult.added.toLocaleString()}</span> transactions added
                {importResult.skipped > 0 && (
                  <>, <span className="text-muted-foreground">{importResult.skipped.toLocaleString()} duplicates skipped</span></>
                )}
              </p>
            </div>

            {catResult && (
              <div className="w-full max-w-xs grid grid-cols-2 gap-2 text-sm">
                {catResult.transfers > 0 && (
                  <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
                    <p className="font-mono font-semibold">{catResult.transfers}</p>
                    <p className="text-xs text-muted-foreground">transfers detected</p>
                  </div>
                )}
                <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
                  <p className="font-mono font-semibold">{catResult.ruleMatched}</p>
                  <p className="text-xs text-muted-foreground">matched by rules</p>
                </div>
                <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
                  <p className="font-mono font-semibold">{catResult.aiCategorised}</p>
                  <p className="text-xs text-muted-foreground">AI categorised</p>
                </div>
                {catResult.needsReview > 0 && (
                  <div className="rounded-lg bg-warning/10 border border-warning/20 px-3 py-2 text-center">
                    <p className="font-mono font-semibold text-warning">{catResult.needsReview}</p>
                    <p className="text-xs text-muted-foreground">need review</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={reset}>Import another file</Button>
              {catResult && catResult.needsReview > 0
                ? <LinkButton href="/review">Review transactions</LinkButton>
                : <LinkButton href="/transactions">View transactions</LinkButton>
              }
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
