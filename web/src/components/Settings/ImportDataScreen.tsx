import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../ui/Button';
import { useAuth } from '../../lib/auth';
import { importTemplate, parseImportCsv, submitImport, importErrorMessage, type ImportKind, type ImportIssue, type ImportResult } from '../../services/importService';

function download(contents: string, name: string) {
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const ImportDataScreen: React.FC = () => {
    const role = useAuth(s => s.role);
    const queryClient = useQueryClient();
    const [kind, setKind] = useState<ImportKind>('medicines');
    const [step, setStep] = useState(1);
    const [rows, setRows] = useState<Record<string, string>[]>([]);
    const [payload, setPayload] = useState<Record<string, unknown>[]>([]);
    const [issues, setIssues] = useState<ImportIssue[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [reading, setReading] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const busy = useRef(false);
    const fileVersion = useRef(0);

    const reset = (nextKind = kind) => {
        fileVersion.current += 1;
        setKind(nextKind); setStep(1); setRows([]); setPayload([]);
        setResult(null); setIssues([]); setError(''); setReading(false);
    };
    const onFile = async (file: File | null) => {
        if (!file) return;
        const version = ++fileVersion.current;
        setResult(null); setError(''); setIssues([]); setRows([]); setPayload([]);
        if (!/\.csv$/i.test(file.name)) { setError('Choose a CSV file. Save Excel workbooks as CSV UTF-8 first.'); return; }
        if (file.size > 10 * 1024 * 1024) { setError('Choose a CSV file smaller than 10 MB.'); return; }
        setReading(true);
        try {
            const parsed = parseImportCsv(await file.text(), kind);
            if (version !== fileVersion.current) return;
            setRows(parsed.preview); setPayload(parsed.payload); setIssues(parsed.issues); setStep(3);
        } catch {
            if (version === fileVersion.current) setError('Could not read this CSV. Check its encoding and quoted values.');
        } finally {
            if (version === fileVersion.current) setReading(false);
        }
    };
    const runImport = async () => {
        if (busy.current || issues.length || !payload.length || role !== 'OWNER') return;
        busy.current = true;
        setLoading(true); setResult(null); setError('');
        try {
            const imported = await submitImport(kind, payload);
            setResult(imported); setStep(5);
            // Refresh inventory, search and dashboard data after the committed write.
            void queryClient.invalidateQueries();
            if (imported.failed) toast.error(`${imported.failed} rows failed. Review the results.`);
            else toast.success(imported.success ? 'Import completed' : 'No new records to import');
        } catch (failure) {
            setError(importErrorMessage(failure));
            toast.error('Import could not be completed. Review the message below.');
        } finally {
            busy.current = false; setLoading(false);
        }
    };

    if (role !== 'OWNER') return <div className="p-8 max-w-7xl mx-auto text-danger font-semibold">Only the clinic owner can import data.</div>;

    return (
        <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 animate-slideIn">
            <h1 className="text-2xl font-black text-foreground-strong">Import data</h1>
            <div className="rounded-lg border-2 border-amber-500/40 bg-amber-500/10 p-4 text-sm text-foreground">
                Review your CSV carefully before confirming. Imported records are saved to this clinic.
            </div>
            <div className="flex gap-2 flex-wrap" role="group" aria-label="Import type">
                {(['medicines', 'customers', 'inventory'] as const).map(k => (
                    <button key={k} type="button" disabled={loading} aria-pressed={kind === k} onClick={() => reset(k)}
                        className={`px-3 py-2 rounded-lg text-xs font-bold uppercase border-2 disabled:opacity-50 ${kind === k ? 'border-primary bg-primary/10' : 'border-border'}`}>
                        {k === 'inventory' ? 'Opening stock' : k}
                    </button>
                ))}
            </div>
            {error && <div role="alert" className="rounded-lg border border-danger p-4 text-danger text-sm whitespace-pre-wrap">{error}</div>}
            {step === 1 && <div className="space-y-4">
                <p className="text-sm text-muted">Step 1: Download a template, fill it, and save as CSV UTF-8.</p>
                {kind === 'medicines' && <div className="text-sm space-y-2">
                    <p>Only name is required. Blank optional fields use these defaults: GST 12%, category tablet, units strip, conversion factor 1, low-stock threshold 10.</p>
                    <p>Set prescription and schedule fields for regulated medicines. Boolean fields accept true/false, yes/no, or 1/0. GST accepts 0, 5, 12, 18, or 28.</p>
                    <p>This imports the medicine catalog. Use Opening stock to import quantities, batches, expiry dates, and prices. Exact repeated medicine rows are skipped; existing records are not updated.</p>
                </div>}
                {kind === 'inventory' && <p className="text-sm">Required: medicine_name, batch_number, expiry_date (YYYY-MM-DD), quantity, mrp, and purchase_price. Use positive whole quantities and positive prices. Existing medicines are matched by name; include generic_name to distinguish matches. Existing batches are rejected. An identical file can be retried safely.</p>}
                {kind === 'customers' && <p className="text-sm">Name and phone are required. Phone must contain at least 8 characters.</p>}
                <p className="text-sm text-muted">Keep barcode, HSN, and phone columns as text in Excel to preserve leading zeros. Maximum {kind === 'medicines' ? '5,000' : kind === 'inventory' ? '2,000' : '10,000'} rows per import.</p>
                <div className="flex gap-2 flex-wrap">
                    <Button variant="secondary" onClick={() => download(importTemplate(kind), `import_template_${kind}.csv`)}>Download template</Button>
                    <Button onClick={() => setStep(2)}>Next</Button>
                </div>
            </div>}
            {step === 2 && <div className="space-y-4">
                <label htmlFor="import-csv" className="block text-sm text-muted">Step 2: Upload your filled CSV.</label>
                <input id="import-csv" type="file" accept=".csv,text/csv" disabled={reading} className="text-sm max-w-full"
                    onChange={e => { void onFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                {reading && <p role="status">Checking CSV…</p>}
                <Button variant="secondary" onClick={() => reset()}>Back</Button>
            </div>}
            {step === 3 && <div className="space-y-4">
                <p className="text-sm font-bold">Step 3: Preview — {rows.length} row{rows.length === 1 ? '' : 's'} (showing up to 10)</p>
                {issues.length > 0 && <div role="alert" className="rounded-lg border border-danger p-4 space-y-2 text-sm">
                    <p className="font-bold text-danger">Fix {issues.length} issues before importing. No rows have been saved.</p>
                    <ul className="list-disc pl-5">{issues.slice(0, 20).map((issue, index) => <li key={index}>Row {issue.row}: {issue.message}</li>)}</ul>
                    <Button variant="secondary" onClick={() => download(Papa.unparse(issues), `import_errors_${kind}.csv`)}>Download all issues</Button>
                </div>}
                {rows.length > 0 && <div className="overflow-auto border-2 border-border rounded-lg max-h-64 text-xs">
                    <table className="w-full"><thead><tr>{Object.keys(rows[0]).map(header => <th key={header} className="text-left p-2 border-b border-border">{header}</th>)}</tr></thead>
                        <tbody>{rows.slice(0, 10).map((row, index) => <tr key={index}>{Object.values(row).map((value, column) => <td key={column} className="p-2 border-b border-border/50">{value}</td>)}</tr>)}</tbody>
                    </table>
                </div>}
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => { setStep(2); setIssues([]); }}>Choose another file</Button>
                    <Button disabled={issues.length > 0 || !rows.length} onClick={() => setStep(4)}>Continue</Button>
                </div>
            </div>}
            {step === 4 && <div className="space-y-4">
                <p className="text-sm">Step 4: Confirm import of {rows.length} {kind === 'inventory' ? 'opening-stock' : kind} rows.</p>
                <div className="flex gap-2">
                    <Button variant="secondary" disabled={loading} onClick={() => { setStep(3); setError(''); }}>Back</Button>
                    <Button onClick={() => void runImport()} isLoading={loading}>Confirm import</Button>
                </div>
                {loading && <p role="status" className="text-sm">Saving your import. Keep this page open until the results appear.</p>}
            </div>}
            {step === 5 && result && <div className="rounded-xl border-2 border-border p-4 space-y-2" role="status">
                <p className="font-bold">Import results</p>
                <p className="text-sm">Imported: {result.success}</p>
                <p className="text-sm">Skipped (already imported or repeated): {result.skipped ?? 0}</p>
                <p className="text-sm">Failed: {result.failed}</p>
                {!!result.errors?.length && <div className="text-sm">
                    <ul className="list-disc pl-5">{result.errors.slice(0, 20).map((issue, index) => <li key={index}>Row {issue.index + 2}: {issue.message}</li>)}</ul>
                    <Button variant="secondary" onClick={() => download(Papa.unparse(result.errors!.map(issue => ({ row: issue.index + 2, message: issue.message }))), `import_errors_${kind}.csv`)}>Download failed rows</Button>
                </div>}
                <Button variant="secondary" onClick={() => reset()}>New import</Button>
            </div>}
        </div>
    );
};
