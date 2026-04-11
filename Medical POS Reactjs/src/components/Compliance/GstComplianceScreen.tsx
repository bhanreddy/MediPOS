import React, { useMemo, useState } from 'react';
import { ReportService } from '../../services/reportService';
import type { TaxReport } from '../../core/types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Table } from '../ui/Table';
import { Badge } from '../ui/Badge';
import { GST_SCREEN_COPY } from '../../config/appContent';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const startOfDayISO = (dateStr: string) => `${dateStr}T00:00:00.000Z`;
const endOfDayISO = (dateStr: string) => `${dateStr}T23:59:59.999Z`;

function taxReportToCsv(t: TaxReport): string {
    const lines = [
        ['startDate', t.startDate],
        ['endDate', t.endDate],
        ['totalTaxable', String(t.totalTaxable)],
        ['totalTax', String(t.totalTax)],
        [],
        ['gstRate', 'taxableAmount', 'taxAmount', 'cgst', 'sgst', 'igst'],
    ];
    for (const row of t.breakdown) {
        lines.push([
            String(row.gstRate),
            String(row.taxableAmount),
            String(row.taxAmount),
            String(row.cgst),
            String(row.sgst),
            String(row.igst),
        ]);
    }
    return lines.map(r => r.join(',')).join('\n');
}

export const GstComplianceScreen: React.FC = () => {
    const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
    const monthStart = useMemo(() => {
        const d = new Date();
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().split('T')[0];
    }, []);

    const [start, setStart] = useState(monthStart);
    const [end, setEnd] = useState(todayStr);
    const [report, setReport] = useState<TaxReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [gstrMonth, setGstrMonth] = useState(String(new Date().getMonth() + 1));
    const [gstrYear, setGstrYear] = useState(String(new Date().getFullYear()));
    const [gstrLoading, setGstrLoading] = useState(false);

    const generate = async () => {
        setLoading(true);
        try {
            const t = await ReportService.getTaxReport(startOfDayISO(start), endOfDayISO(end));
            setReport(t);
        } finally {
            setLoading(false);
        }
    };

    const exportCsv = () => {
        if (!report) return;
        const blob = new Blob([taxReportToCsv(report)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${GST_SCREEN_COPY.csvFilenamePrefix}_${start}_${end}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const downloadGstr1 = async () => {
        const m = parseInt(gstrMonth, 10);
        const y = parseInt(gstrYear, 10);
        if (m < 1 || m > 12 || y < 2000) {
            toast.error('Select a valid month and year');
            return;
        }
        setGstrLoading(true);
        try {
            const res = await api.get('/reports/gstr1-export', { params: { month: m, year: y } });
            const blob = new Blob([JSON.stringify(res.data.data, null, 2)], {
                type: 'application/json;charset=utf-8',
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `GSTR1_${y}_${String(m).padStart(2, '0')}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('GSTR-1 JSON downloaded — validate in GST sandbox before production use');
        } catch {
            toast.error('Failed to export GSTR-1');
        } finally {
            setGstrLoading(false);
        }
    };

    const printPdf = () => {
        if (!report) return;
        const w = window.open('', '_blank');
        if (!w) return;
        const rows = report.breakdown
            .map(
                r =>
                    `<tr><td>${r.gstRate}%</td><td>${r.taxableAmount.toFixed(2)}</td><td>${r.taxAmount.toFixed(2)}</td><td>${r.cgst.toFixed(2)}</td><td>${r.sgst.toFixed(2)}</td><td>${r.igst.toFixed(2)}</td></tr>`
            )
            .join('');
        w.document.write(`<!DOCTYPE html><html><head><title>${GST_SCREEN_COPY.printDocTitle}</title>
          <style>body{font-family:sans-serif;padding:24px;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #333;padding:8px;text-align:right;} th{text-align:left;}</style>
          </head><body>
          <h1>${GST_SCREEN_COPY.printDocTitle}</h1>
          <p>${report.startDate} to ${report.endDate}</p>
          <p>Total taxable: ₹${report.totalTaxable.toFixed(2)} | Total tax: ₹${report.totalTax.toFixed(2)}</p>
          <table><thead><tr><th>Rate</th><th>Taxable</th><th>Tax</th><th>CGST</th><th>SGST</th><th>IGST</th></tr></thead><tbody>${rows}</tbody></table>
          <script>window.onload=function(){window.print();}</script>
          </body></html>`);
        w.document.close();
    };

    return (
        <div className="h-full flex flex-col gap-8 animate-slideIn select-none">
            <div>
                <h2 className="text-billing-total font-black text-foreground-strong tracking-tighter uppercase italic leading-none">
                    {GST_SCREEN_COPY.title}
                </h2>
                <p className="text-muted text-sm font-black uppercase tracking-widest mt-1">{GST_SCREEN_COPY.subtitle}</p>
            </div>

            <div className="rounded-xl border-2 border-border bg-surface-elevated p-4 space-y-3">
                <h3 className="text-sm font-black uppercase tracking-wide text-muted">GSTR-1 JSON export</h3>
                <p className="text-xs text-muted">
                    Upload the downloaded file to the GST sandbox portal to validate before relying on it for filing.
                </p>
                <div className="flex flex-wrap gap-3 items-end">
                    <Input
                        label="Month (1–12)"
                        type="number"
                        min={1}
                        max={12}
                        value={gstrMonth}
                        onChange={e => setGstrMonth(e.target.value)}
                    />
                    <Input label="Year" type="number" min={2000} max={2100} value={gstrYear} onChange={e => setGstrYear(e.target.value)} />
                    <Button variant="primary" onClick={() => void downloadGstr1()} isLoading={gstrLoading}>
                        Download GSTR-1 JSON
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <Input label={GST_SCREEN_COPY.startDate} type="date" value={start} onChange={e => setStart(e.target.value)} />
                <Input label={GST_SCREEN_COPY.endDate} type="date" value={end} onChange={e => setEnd(e.target.value)} />
                <Button variant="primary" onClick={() => void generate()} isLoading={loading}>
                    {GST_SCREEN_COPY.generate}
                </Button>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={exportCsv} disabled={!report}>
                        {GST_SCREEN_COPY.csv}
                    </Button>
                    <Button variant="secondary" onClick={printPdf} disabled={!report}>
                        {GST_SCREEN_COPY.pdfPrint}
                    </Button>
                </div>
            </div>

            {report && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-surface-elevated border-2 border-border rounded-xl p-4">
                        <div className="text-label text-muted font-black uppercase">{GST_SCREEN_COPY.taxable}</div>
                        <div className="text-2xl font-black tabular-nums">₹{report.totalTaxable.toFixed(2)}</div>
                    </div>
                    <div className="bg-surface-elevated border-2 border-border rounded-xl p-4">
                        <div className="text-label text-muted font-black uppercase">{GST_SCREEN_COPY.totalTax}</div>
                        <div className="text-2xl font-black tabular-nums">₹{report.totalTax.toFixed(2)}</div>
                    </div>
                    <div className="bg-surface-elevated border-2 border-primary/20 rounded-xl p-4 flex items-center justify-center">
                        <Badge variant="primary">{GST_SCREEN_COPY.badge}</Badge>
                    </div>
                </div>
            )}

            <div className="flex-1 min-h-0 bg-surface border-2 border-border rounded-xl overflow-hidden">
                <Table
                    headers={[...GST_SCREEN_COPY.tableHead]}
                    data={report?.breakdown ?? []}
                    isEmpty={!report}
                    emptyMessage={GST_SCREEN_COPY.emptyTable}
                    renderRow={(row, i) => (
                        <tr key={i} className="border-b-2 border-border">
                            <td className="px-4 py-2 font-black">{row.gstRate}%</td>
                            <td className="px-4 py-2 tabular-nums">₹{row.taxableAmount.toFixed(2)}</td>
                            <td className="px-4 py-2 tabular-nums">₹{row.taxAmount.toFixed(2)}</td>
                            <td className="px-4 py-2 tabular-nums">₹{row.cgst.toFixed(2)}</td>
                            <td className="px-4 py-2 tabular-nums">₹{row.sgst.toFixed(2)}</td>
                            <td className="px-4 py-2 tabular-nums">₹{row.igst.toFixed(2)}</td>
                        </tr>
                    )}
                />
            </div>
        </div>
    );
};
