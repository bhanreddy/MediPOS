import React, { useEffect, useState } from 'react';
import api from '../../lib/api';
import type { Product } from '../../core/types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Table } from '../ui/Table';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { MEDICINE_MASTER_SCREEN_COPY } from '../../config/appContent';

const emptyForm = () => ({
    name: '',
    composition: '',
    manufacturer: '',
    type: 'TABLET',
    category: '',
    hsn_code: '3004',
    gst_rate: '12',
    min_stock_alert: '10',
    barcode: '',
    schedule_h: false,
});

export const MedicineMasterScreen: React.FC = () => {
    const [rows, setRows] = useState<Product[]>([]);
    const [q, setQ] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Product | null>(null);
    const [form, setForm] = useState(emptyForm());

    const load = async () => {
        const res = await api.get('/inventory/medicines', { params: { q: q.trim() || undefined } });
        setRows(res.data?.data || []);
    };

    useEffect(() => {
        void load();
    }, [q]);

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm());
        setModalOpen(true);
    };

    const openEdit = (p: Product) => {
        setEditing(p);
        setForm({
            name: p.name,
            composition: p.composition || '',
            manufacturer: p.manufacturer || '',
            type: p.type || 'TABLET',
            category: p.category || '',
            hsn_code: p.hsn_code || '3004',
            gst_rate: String(p.gst_rate ?? 12),
            min_stock_alert: String(p.min_stock_alert ?? (p as any).low_stock_threshold ?? 10),
            barcode: p.barcode || '',
            schedule_h: !!(p.schedule_h || (p as any).is_schedule_h1),
        });
        setModalOpen(true);
    };

    const save = async () => {
        const gst = Number(form.gst_rate) || 0;
        const minA = Math.max(0, parseInt(form.min_stock_alert, 10) || 0);

        if (!form.name.trim() || !form.manufacturer.trim()) {
            // eslint-disable-next-line no-alert
            alert('Name and manufacturer are required');
            return;
        }

        let categoryVal = form.category.trim().toLowerCase();
        if (categoryVal !== 'tablet' && categoryVal !== 'syrup' && categoryVal !== 'injection' && categoryVal !== 'capsule' && categoryVal !== 'cream' && categoryVal !== 'other') {
            categoryVal = 'tablet';
        }

        const payload = {
            name: form.name.trim(),
            generic_name: form.composition.trim() || null,
            manufacturer: form.manufacturer.trim(),
            category: categoryVal,
            hsn_code: form.hsn_code.trim() || '3004',
            gst_rate: gst,
            low_stock_threshold: minA,
            unit: 'strip',
            is_schedule_h1: form.schedule_h,
            barcode: form.barcode.trim() || null,
        };

        try {
            if (editing) {
                const targetId = editing.id || editing._local_id;
                await api.put(`/inventory/medicines/${targetId}`, payload);
            } else {
                await api.post('/inventory/medicines', payload);
            }
            setModalOpen(false);
            await load();
        } catch (e: any) {
            alert(e.response?.data?.error?.message || e.message || 'Failed to save medicine');
        }
    };

    const toggleActive = async (p: Product) => {
        try {
            const targetId = p.id || p._local_id;
            await api.put(`/inventory/medicines/${targetId}`, {
                is_active: !p.is_active
            });
            await load();
        } catch (e: any) {
            alert('Failed to toggle status');
        }
    };

    return (
        <div className="h-full flex flex-col gap-6 animate-slideIn select-none">
            <div className="flex justify-between items-end flex-wrap gap-4">
                <div>
                    <h2 className="text-billing-total font-black text-foreground-strong tracking-tighter uppercase italic leading-none">
                        {MEDICINE_MASTER_SCREEN_COPY.title}
                    </h2>
                    <p className="text-muted text-sm font-black uppercase tracking-widest mt-1">
                        {MEDICINE_MASTER_SCREEN_COPY.subtitle}
                    </p>
                </div>
                <div className="flex gap-2 items-center">
                    <Input
                        placeholder={MEDICINE_MASTER_SCREEN_COPY.searchPlaceholder}
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        containerClassName="w-72"
                    />
                    <Button variant="primary" className="font-black" onClick={openCreate}>
                        {MEDICINE_MASTER_SCREEN_COPY.newMedicine}
                    </Button>
                </div>
            </div>

            <div className="flex-1 min-h-0 bg-surface border-2 border-border rounded-xl overflow-hidden">
                <Table
                    headers={['NAME', 'CATEGORY', 'TYPE', 'GST%', 'MIN_STOCK', 'BARCODE', 'H', 'STATUS', 'ACTIONS']}
                    data={rows}
                    isEmpty={rows.length === 0}
                    emptyMessage="No medicines. Add from purchase flow or here."
                    renderRow={p => (
                        <tr key={p.id} className="border-b-2 border-border hover:bg-surface-elevated">
                            <td className="px-4 py-3 font-black text-sm uppercase">{p.name}</td>
                            <td className="px-4 py-3 text-muted text-xs">{p.category || '—'}</td>
                            <td className="px-4 py-3 text-xs">{p.type}</td>
                            <td className="px-4 py-3 tabular-nums">{p.gst_rate}%</td>
                            <td className="px-4 py-3 tabular-nums">{p.min_stock_alert}</td>
                            <td className="px-4 py-3 font-mono text-xs">{p.barcode || '—'}</td>
                            <td className="px-4 py-3">{p.schedule_h ? <Badge variant="danger">H</Badge> : '—'}</td>
                            <td className="px-4 py-3">
                                <Badge variant={p.is_active ? 'success' : 'neutral'}>{p.is_active ? 'Active' : 'Off'}</Badge>
                            </td>
                            <td className="px-4 py-3 flex gap-2">
                                <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                                    Edit
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => void toggleActive(p)}>
                                    {p.is_active ? 'Deactivate' : 'Activate'}
                                </Button>
                            </td>
                        </tr>
                    )}
                />
            </div>

            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit medicine' : 'New medicine'}>
                <div className="space-y-3 p-2 max-h-[70vh] overflow-y-auto">
                    <Input label="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    <Input
                        label="Manufacturer"
                        value={form.manufacturer}
                        onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))}
                    />
                    <Input
                        label="Composition"
                        value={form.composition}
                        onChange={e => setForm(f => ({ ...f, composition: e.target.value }))}
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <Input label="Category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                        <div>
                            <label className="text-[10px] font-black uppercase text-muted tracking-widest ml-1 block mb-1">Type</label>
                            <select
                                className="w-full bg-surface-elevated border-2 border-border rounded-md px-3 py-3 font-medium"
                                value={form.type}
                                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                            >
                                {['TABLET', 'SYRUP', 'INJECTION', 'CAPSULE', 'CREAM', 'OTHER'].map(t => (
                                    <option key={t} value={t}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <Input label="HSN" value={form.hsn_code} onChange={e => setForm(f => ({ ...f, hsn_code: e.target.value }))} />
                        <Input label="GST %" value={form.gst_rate} onChange={e => setForm(f => ({ ...f, gst_rate: e.target.value }))} />
                        <Input
                            label="Min stock alert"
                            value={form.min_stock_alert}
                            onChange={e => setForm(f => ({ ...f, min_stock_alert: e.target.value }))}
                        />
                    </div>
                    <Input label="Barcode" value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} />
                    <label className="flex items-center gap-2 text-sm font-bold">
                        <input
                            type="checkbox"
                            checked={form.schedule_h}
                            onChange={e => setForm(f => ({ ...f, schedule_h: e.target.checked }))}
                        />
                        Schedule H (prescription mandatory)
                    </label>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={() => setModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={() => void save()}>
                            Save
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
