import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Table } from '../ui/Table';
import { DELIVERY_COPY, DELIVERY_DEFAULTS, DELIVERY_SEED, FEATURE_BADGES, type DeliverySeedRow } from '../../config/appContent';

export const DoorstepDeliveryScreen: React.FC = () => {
    const [rows, setRows] = useState<DeliverySeedRow[]>(() => [...DELIVERY_SEED]);
    const [invoice, setInvoice] = useState('');
    const [address, setAddress] = useState('');

    const add = () => {
        if (!invoice.trim() || !address.trim()) return;
        setRows([
            {
                id: crypto.randomUUID(),
                invoice: invoice.trim(),
                address: address.trim(),
                rider: DELIVERY_DEFAULTS.newRider,
                status: DELIVERY_DEFAULTS.newStatus,
            },
            ...rows,
        ]);
        setInvoice('');
        setAddress('');
    };

    return (
        <div className="h-full flex flex-col gap-6 animate-slideIn select-none">
            <div className="flex justify-between items-end flex-wrap gap-4">
                <div>
                    <h2 className="text-billing-total font-black text-foreground-strong tracking-tighter uppercase italic leading-none">
                        {DELIVERY_COPY.title}
                    </h2>
                    <p className="text-muted text-sm font-black uppercase tracking-widest mt-1">{DELIVERY_COPY.subtitle}</p>
                </div>
                <Badge variant="warning">{FEATURE_BADGES.beta}</Badge>
            </div>

            <div className="bg-surface border-2 border-border rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <Input label={DELIVERY_COPY.labels.invoice} value={invoice} onChange={e => setInvoice(e.target.value)} />
                <Input label={DELIVERY_COPY.labels.address} value={address} onChange={e => setAddress(e.target.value)} />
                <Button variant="primary" className="font-black" onClick={add}>
                    {DELIVERY_COPY.createButton}
                </Button>
            </div>

            <div className="flex-1 min-h-0 bg-surface border-2 border-border rounded-xl overflow-hidden">
                <Table
                    headers={[...DELIVERY_COPY.tableHeaders]}
                    data={rows}
                    renderRow={r => (
                        <tr key={r.id} className="border-b-2 border-border">
                            <td className="px-4 py-2 font-mono text-sm">{r.invoice}</td>
                            <td className="px-4 py-2 text-sm">{r.address}</td>
                            <td className="px-4 py-2">{r.rider}</td>
                            <td className="px-4 py-2">
                                <Badge variant="primary">{r.status}</Badge>
                            </td>
                        </tr>
                    )}
                />
            </div>
        </div>
    );
};
