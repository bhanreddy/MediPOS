import React, { useEffect, useState } from 'react';
import { db } from '../../db/index';
import type { Customer, Sale } from '../../core/types';
import { CustomerService } from '../../services/customerService';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Table } from '../ui/Table';
import { Badge } from '../ui/Badge';
import { HydrationService } from '../../state/hydration';
import { CUSTOMERS_SCREEN_COPY } from '../../config/appContent';

export const CustomersScreen: React.FC = () => {
    const [rows, setRows] = useState<Customer[]>([]);
    const [selected, setSelected] = useState<Customer | null>(null);
    const [sales, setSales] = useState<Sale[]>([]);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [state, setState] = useState('');
    const [creditLimit, setCreditLimit] = useState('');

    const load = async () => {
        setRows(await db.customers.orderBy('name').toArray());
    };

    useEffect(() => {
        void load();
    }, []);

    const loadSales = async (c: Customer) => {
        setSelected(c);
        const s = await db.sales.filter(s => s.customer_id === c.id).toArray();
        s.sort((a, b) => b.created_at.localeCompare(a.created_at));
        setSales(s.slice(0, 50));
    };

    const save = async () => {
        if (!name.trim() || !phone.trim()) {
            // eslint-disable-next-line no-alert
            alert(CUSTOMERS_SCREEN_COPY.namePhoneRequired);
            return;
        }
        try {
            const created = await CustomerService.addCustomer({
                name: name.trim(),
                phone: phone.trim(),
                address: '',
            });
            if (state.trim() || creditLimit) {
                await CustomerService.updateCustomer(created.id, {
                    state: state.trim() || undefined,
                    credit_limit: creditLimit ? parseFloat(creditLimit) : undefined,
                });
            }
            setName('');
            setPhone('');
            setState('');
            setCreditLimit('');
            await HydrationService.hydrateCustomers();
            await load();
        } catch (e: unknown) {
            // eslint-disable-next-line no-alert
            alert(e instanceof Error ? e.message : String(e));
        }
    };

    const patchCredit = async (c: Customer) => {
        const lim = parseFloat(creditLimit);
        await CustomerService.updateCustomer(c.id, {
            state: state.trim() || c.state,
            credit_limit: Number.isFinite(lim) ? lim : c.credit_limit,
        });
        await HydrationService.hydrateCustomers();
        await load();
        if (selected?.id === c.id) {
            const u = await db.customers.get(c.id);
            if (u) await loadSales(u);
        }
    };

    return (
        <div className="h-full flex flex-col gap-6 animate-slideIn select-none">
            <div>
                <h2 className="text-billing-total font-black text-foreground-strong tracking-tighter uppercase italic leading-none">
                    {CUSTOMERS_SCREEN_COPY.title}
                </h2>
                <p className="text-muted text-sm font-black uppercase tracking-widest mt-1">{CUSTOMERS_SCREEN_COPY.subtitle}</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-surface border-2 border-border rounded-xl p-4 space-y-3">
                    <div className="text-heading font-black uppercase">{CUSTOMERS_SCREEN_COPY.newSection}</div>
                    <Input label={CUSTOMERS_SCREEN_COPY.name} value={name} onChange={e => setName(e.target.value)} />
                    <Input label={CUSTOMERS_SCREEN_COPY.phone} value={phone} onChange={e => setPhone(e.target.value)} />
                    <Input label={CUSTOMERS_SCREEN_COPY.stateLabel} value={state} onChange={e => setState(e.target.value)} />
                    <Input label={CUSTOMERS_SCREEN_COPY.creditLimit} value={creditLimit} onChange={e => setCreditLimit(e.target.value)} />
                    <Button variant="primary" className="font-black" onClick={() => void save()}>
                        {CUSTOMERS_SCREEN_COPY.save}
                    </Button>
                </div>

                <div className="bg-surface border-2 border-border rounded-xl overflow-hidden min-h-[240px]">
                    <Table
                        headers={[...CUSTOMERS_SCREEN_COPY.tableHead]}
                        data={rows}
                        renderRow={c => (
                            <tr key={c.id} className="border-b-2 border-border hover:bg-surface-elevated">
                                <td className="px-4 py-2 font-bold">{c.name}</td>
                                <td className="px-4 py-2 font-mono text-sm">{c.phone}</td>
                                <td className="px-4 py-2 tabular-nums">₹{(c.credit_balance ?? 0).toFixed(2)}</td>
                                <td className="px-4 py-2 tabular-nums">{c.credit_limit != null ? `₹${c.credit_limit}` : '—'}</td>
                                <td className="px-4 py-2">
                                    <Button size="sm" variant="secondary" onClick={() => void loadSales(c)}>
                                        {CUSTOMERS_SCREEN_COPY.history}
                                    </Button>
                                </td>
                            </tr>
                        )}
                    />
                </div>
            </div>

            {selected && (
                <div className="bg-surface-elevated border-2 border-primary/20 rounded-xl p-4 space-y-4">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                        <div>
                            <span className="text-heading font-black uppercase">{selected.name}</span>
                            <span className="ml-2">
                                <Badge variant="neutral">{selected.phone}</Badge>
                            </span>
                        </div>
                        <Button variant="ghost" onClick={() => setSelected(null)}>
                            {CUSTOMERS_SCREEN_COPY.close}
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <Input
                            label={CUSTOMERS_SCREEN_COPY.updateState}
                            value={state}
                            onChange={e => setState(e.target.value)}
                            placeholder={selected.state || ''}
                        />
                        <Input
                            label={CUSTOMERS_SCREEN_COPY.updateCreditLabel}
                            value={creditLimit}
                            onChange={e => setCreditLimit(e.target.value)}
                            placeholder={selected.credit_limit != null ? String(selected.credit_limit) : ''}
                        />
                        <Button variant="primary" className="h-[52px] mt-auto font-black" onClick={() => void patchCredit(selected)}>
                            {CUSTOMERS_SCREEN_COPY.updateCredit}
                        </Button>
                    </div>
                    <div className="text-label font-black uppercase text-muted">{CUSTOMERS_SCREEN_COPY.recentInvoices}</div>
                    <Table
                        headers={[...CUSTOMERS_SCREEN_COPY.tableInv]}
                        data={sales}
                        isEmpty={sales.length === 0}
                        emptyMessage={CUSTOMERS_SCREEN_COPY.emptySales}
                        renderRow={s => (
                            <tr key={s.id} className="border-b border-border">
                                <td className="px-4 py-2 font-mono">{s.invoice_number}</td>
                                <td className="px-4 py-2 text-xs">{new Date(s.created_at).toLocaleString()}</td>
                                <td className="px-4 py-2 font-black tabular-nums">₹{s.final_amount.toFixed(2)}</td>
                                <td className="px-4 py-2">{s.payment_mode}</td>
                            </tr>
                        )}
                    />
                </div>
            )}
        </div>
    );
};
