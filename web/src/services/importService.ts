import Papa from 'papaparse';
import api from '../lib/api';

export type ImportKind = 'medicines' | 'customers' | 'inventory';
export type ImportIssue = { row: number; message: string };
export type ImportResult = { success: number; failed: number; skipped?: number; errors?: { index: number; message: string }[] };
type Field = { type?: 'number' | 'boolean'; required?: boolean; values?: readonly string[]; min?: number; max?: number; integer?: boolean; positive?: boolean };
const productTypes = ['MEDICINE', 'OTC', 'SURGICAL', 'MEDICAL_DEVICE', 'FMCG', 'WELLNESS', 'COSMETIC', 'PERSONAL_CARE', 'CONSUMABLE', 'OTHER'];
const schedules = ['NONE', 'SCHEDULE_H', 'SCHEDULE_H1', 'SCHEDULE_X', 'NARCOTIC'];
const gst = { type: 'number', values: ['0', '5', '12', '18', '28'] } as const;
const positive = { type: 'number', positive: true } as const;

export const IMPORT_FIELDS: Record<ImportKind, Record<string, Field>> = {
    medicines: {
        name: { required: true }, generic_name: {}, manufacturer: {}, category: {}, gst_rate: gst,
        hsn_code: {}, barcode: {}, unit: {}, product_type: { values: productTypes }, brand_name: {},
        composition: {}, dosage_form: {}, strength: {}, pack_size: {}, base_unit: {}, sale_unit: {},
        conversion_factor: positive, marketer: {}, primary_barcode: {},
        is_schedule_h1: { type: 'boolean' }, prescription_required: { type: 'boolean' },
        schedule_classification: { values: schedules }, cold_chain_required: { type: 'boolean' },
        storage_instructions: {}, minimum_margin_percent: { type: 'number', min: 0 },
        low_stock_threshold: { ...positive, integer: true, max: 2147483647 },
    },
    customers: { name: { required: true }, phone: { required: true }, email: {}, address: {} },
    inventory: {
        medicine_name: { required: true }, batch_number: { required: true }, expiry_date: { required: true },
        quantity: { ...positive, integer: true, max: 2147483647, required: true }, mrp: { ...positive, required: true },
        purchase_price: { ...positive, required: true }, gst_rate: gst, generic_name: {},
    },
};

export function importTemplate(kind: ImportKind) {
    return '\uFEFF' + Papa.unparse([Object.keys(IMPORT_FIELDS[kind])]) + '\r\n';
}

function normalizeHeader(value: string, kind: ImportKind) {
    const key = value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const aliases: Record<string, string> = { generic: 'generic_name', hsn: 'hsn_code' };
    if (kind === 'inventory') Object.assign(aliases, { name: 'medicine_name', batch: 'batch_number', expiry: 'expiry_date', cost: 'purchase_price' });
    return aliases[key] || key;
}

export function parseImportCsv(csv: string, kind: ImportKind) {
    const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: 'greedy' });
    // A valid name-only CSV has no delimiter to detect. Header and row checks still apply.
    const issues: ImportIssue[] = parsed.errors.filter(error => error.code !== 'UndetectableDelimiter')
        .map(error => ({ row: (error.row ?? 0) + 1, message: error.message }));
    if (csv.includes('\uFFFD')) issues.push({ row: 1, message: 'The file contains unreadable characters. Save it as CSV UTF-8 and upload again.' });
    const [rawHeaders = [], ...data] = parsed.data;
    const headers = rawHeaders.map(header => normalizeHeader(header, kind));
    const fields = IMPORT_FIELDS[kind];
    const seen = new Set<string>();
    headers.forEach(header => {
        if (!header || !Object.hasOwn(fields, header)) issues.push({ row: 1, message: `Unknown column: ${header || '(blank)'}. Use the downloaded template.` });
        if (seen.has(header)) issues.push({ row: 1, message: `Duplicate column: ${header}.` });
        seen.add(header);
    });
    for (const [name, field] of Object.entries(fields)) {
        if (field.required && !seen.has(name)) issues.push({ row: 1, message: `Missing required column: ${name}.` });
    }
    const limit = kind === 'medicines' ? 5000 : kind === 'inventory' ? 2000 : 10000;
    if (!data.length) issues.push({ row: 1, message: 'The CSV has no data rows. Fill the template before uploading.' });
    if (data.length > limit) issues.push({ row: 1, message: `Maximum ${limit.toLocaleString()} rows per import. Split this file into smaller files.` });
    const preview: Record<string, string>[] = [];
    const payload: Record<string, unknown>[] = [];
    for (const [index, cells] of data.entries()) {
        const row = index + 2;
        if (cells.length !== headers.length) issues.push({ row, message: `Expected ${headers.length} columns, found ${cells.length}. Check commas and quotes.` });
        const record: Record<string, unknown> = {};
        const display: Record<string, string> = {};
        headers.forEach((header, column) => {
            const value = (cells[column] ?? '').trim();
            display[header] = value;
            const field = fields[header];
            if (!field) return;
            if (!value) {
                if (field.required) issues.push({ row, message: `${header} is required.` });
                return; // Omit blank optional cells so server defaults apply.
            }
            let converted: string | number | boolean = value;
            if (field.type === 'number') {
                // Reject commas, currency, exponents and malformed numbers instead of coercing to zero.
                converted = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
                if (!Number.isFinite(converted) || (field.integer && !Number.isSafeInteger(converted)) ||
                    (field.positive && converted <= 0) || (field.min !== undefined && converted < field.min) ||
                    (field.max !== undefined && converted > field.max)) {
                    issues.push({ row, message: `${header} must be ${field.positive ? 'a positive' : 'a non-negative'} ${field.integer ? 'whole number' : 'number'}.` });
                }
            } else if (field.type === 'boolean') {
                if (!['true', 'false', 'yes', 'no', '1', '0'].includes(value.toLowerCase())) {
                    issues.push({ row, message: `${header} must be true/false, yes/no, or 1/0.` });
                }
                converted = ['true', 'yes', '1'].includes(value.toLowerCase());
            } else if (field.values) converted = value.toUpperCase();
            if (field.values && !field.values.includes(String(converted))) issues.push({ row, message: `${header} must be one of: ${field.values.join(', ')}.` });
            if ((header === 'name' || header === 'medicine_name') && value.length > 300) issues.push({ row, message: `${header} must be at most 300 characters.` });
            if (kind === 'customers' && header === 'phone' && value.length < 8) issues.push({ row, message: 'phone must contain at least 8 characters.' });
            if (header === 'expiry_date') {
                const date = new Date(`${value}T00:00:00Z`);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000') || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
                    issues.push({ row, message: 'expiry_date must be a valid calendar date in YYYY-MM-DD format.' });
                }
            }
            record[header] = converted;
        });
        if (kind === 'medicines' && record.is_schedule_h1 === true && record.schedule_classification &&
            !['NONE', 'SCHEDULE_H1'].includes(String(record.schedule_classification))) {
            issues.push({ row, message: 'is_schedule_h1 conflicts with schedule_classification. Choose SCHEDULE_H1 or correct the flag.' });
        }
        preview.push(display);
        payload.push(record);
    }
    const body = kind === 'medicines' ? { medicines: payload } : kind === 'customers' ? { customers: payload } : { lines: payload };
    if (new TextEncoder().encode(JSON.stringify(body)).length > 1_900_000) issues.push({ row: 1, message: 'The import exceeds the server request limit. Split this file into smaller files.' });
    return { preview, payload, issues };
}

export async function submitImport(kind: ImportKind, rows: Record<string, unknown>[]): Promise<ImportResult> {
    const options = { timeout: 120000, 'axios-retry': { retries: 0 } };
    const response = kind === 'medicines'
        ? await api.post('/bulk/medicines', { medicines: rows }, options)
        : kind === 'customers'
            ? await api.post('/bulk/customers', { customers: rows }, options)
            : await api.post('/bulk/inventory', { lines: rows }, options);
    return response.data;
}

export function importErrorMessage(error: unknown): string {
    const response = (error as { response?: { data?: { error?: string | { message?: string }; details?: { path: (string | number)[]; message: string }[] } } })?.response?.data;
    if (response?.details?.length) return response.details.map(detail => {
        const index = detail.path.find(part => typeof part === 'number');
        return `${typeof index === 'number' ? `Row ${index + 2}: ` : ''}${detail.path.filter(part => typeof part === 'string').join('.')}: ${detail.message}`;
    }).slice(0, 10).join('\n');
    if (typeof response?.error === 'string' && response.error !== 'Internal Server Error') return response.error;
    return (typeof response?.error === 'object' && response.error?.message) || 'The import result could not be confirmed. Medicine and opening-stock imports can be retried safely with the same file. Check customer records before retrying customer imports.';
}
