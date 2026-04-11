import React, { useState, useCallback } from 'react';
import Papa from 'papaparse';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { Button } from '../ui/Button';
import { useAuth } from '../../lib/auth';

type Wizard = 'medicines' | 'customers' | 'inventory';

export const ImportDataScreen: React.FC = () => {
    const role = useAuth((s) => s.role);
    const [kind, setKind] = useState<Wizard>('medicines');
    const [step, setStep] = useState(1);
    const [rows, setRows] = useState<Record<string, string>[]>([]);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ success: number; failed: number } | null>(null);

    const onFile = useCallback(
        (file: File | null) => {
            if (!file) return;
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (res) => {
                    setRows((res.data as Record<string, string>[]) || []);
                    setStep(3);
                    setResult(null);
                },
                error: () => toast.error('Could not parse CSV'),
            });
        },
        []
    );

    const runImport = async () => {
        setLoading(true);
        setResult(null);
        try {
            if (kind === 'medicines') {
                const medicines = rows.map((r) => ({
                    name: r.name || r.Name,
                    generic_name: r.generic_name || r.generic || null,
                    manufacturer: r.manufacturer || null,
                    category: (r.category as 'tablet') || 'tablet',
                    hsn_code: r.hsn_code || r.hsn || null,
                    gst_rate: Number(r.gst_rate || 0),
                    barcode: r.barcode || null,
                })).filter((m) => m.name);
                const res = await api.post('/bulk/medicines', { medicines });
                setResult({ success: res.data.success, failed: res.data.failed });
            } else if (kind === 'customers') {
                const customers = rows.map((r) => ({
                    name: r.name || r.Name,
                    phone: r.phone || r.Phone,
                    email: r.email || null,
                    address: r.address || null,
                })).filter((c) => c.name && c.phone);
                const res = await api.post('/bulk/customers', { customers });
                setResult({ success: res.data.success, failed: res.data.failed });
            } else {
                const lines = rows.map((r) => ({
                    medicine_name: r.medicine_name || r.name,
                    batch_number: r.batch_number || r.batch,
                    expiry_date: r.expiry_date || r.expiry,
                    quantity: Number(r.quantity),
                    mrp: Number(r.mrp),
                    purchase_price: Number(r.purchase_price || r.cost),
                    generic_name: r.generic_name || null,
                    gst_rate: Number(r.gst_rate || 0),
                })).filter((l) => l.medicine_name && l.batch_number);
                const res = await api.post('/bulk/inventory', { lines });
                setResult({ success: res.data.success, failed: res.data.failed });
            }
            toast.success('Import completed');
            setStep(5);
        } catch {
            toast.error('Import failed');
        } finally {
            setLoading(false);
        }
    };

    if (role && role !== 'OWNER') {
        return <div className="p-8 text-danger font-semibold">Only the clinic owner can import data.</div>;
    }

    return (
        <div className="max-w-3xl space-y-6 animate-slideIn">
            <div className="rounded-lg border-2 border-amber-500/40 bg-amber-500/10 p-4 text-sm text-foreground">
                This cannot be undone. Review your CSV carefully before confirming.
            </div>

            <h1 className="text-2xl font-black text-foreground-strong">Import data</h1>

            <div className="flex gap-2 flex-wrap">
                {(['medicines', 'customers', 'inventory'] as const).map((k) => (
                    <button
                        key={k}
                        type="button"
                        onClick={() => {
                            setKind(k);
                            setStep(1);
                            setRows([]);
                            setResult(null);
                        }}
                        className={`px-3 py-2 rounded-lg text-xs font-bold uppercase border-2 ${
                            kind === k ? 'border-primary bg-primary/10' : 'border-border'
                        }`}
                    >
                        {k}
                    </button>
                ))}
            </div>

            {step === 1 && (
                <div className="space-y-4">
                    <p className="text-sm text-muted">Step 1: Download a template and fill columns in Excel.</p>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            const headers =
                                kind === 'medicines'
                                    ? 'name,generic_name,manufacturer,category,gst_rate,hsn_code,barcode'
                                    : kind === 'customers'
                                      ? 'name,phone,email,address'
                                      : 'medicine_name,batch_number,expiry_date,quantity,mrp,purchase_price,gst_rate';
                            const blob = new Blob([headers + '\n'], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `import_template_${kind}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                        }}
                    >
                        Download template
                    </Button>
                    <Button variant="primary" onClick={() => setStep(2)}>
                        Next
                    </Button>
                </div>
            )}

            {step === 2 && (
                <div className="space-y-4">
                    <p className="text-sm text-muted">Step 2: Upload your filled CSV.</p>
                    <input
                        type="file"
                        accept=".csv,text/csv"
                        className="text-sm"
                        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                    />
                </div>
            )}

            {step === 3 && rows.length > 0 && (
                <div className="space-y-4">
                    <p className="text-sm font-bold">Step 3: Preview (first 10 rows)</p>
                    <div className="overflow-auto border-2 border-border rounded-lg max-h-64 text-xs">
                        <table className="w-full">
                            <thead>
                                <tr>
                                    {Object.keys(rows[0]).map((h) => (
                                        <th key={h} className="text-left p-2 border-b border-border">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.slice(0, 10).map((r, i) => (
                                    <tr key={i}>
                                        {Object.values(r).map((v, j) => (
                                            <td key={j} className="p-2 border-b border-border/50">
                                                {String(v)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => setStep(2)}>
                            Back
                        </Button>
                        <Button variant="primary" onClick={() => setStep(4)}>
                            Continue
                        </Button>
                    </div>
                </div>
            )}

            {step === 4 && (
                <div className="space-y-4">
                    <p className="text-sm">Step 4: Confirm import of {rows.length} rows.</p>
                    <Button variant="primary" onClick={() => void runImport()} isLoading={loading}>
                        Confirm import
                    </Button>
                </div>
            )}

            {step === 5 && result && (
                <div className="rounded-xl border-2 border-border p-4 space-y-2">
                    <p className="font-bold">Results</p>
                    <p className="text-sm">Imported: {result.success}</p>
                    <p className="text-sm">Failed: {result.failed}</p>
                    <Button variant="secondary" onClick={() => { setStep(1); setRows([]); setResult(null); }}>
                        New import
                    </Button>
                </div>
            )}
        </div>
    );
};
