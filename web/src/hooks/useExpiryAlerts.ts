import { useState, useEffect } from 'react';
import api from '../lib/api';
import type { Product, Batch } from '../core/types';

export type ExpiryFilter = 7 | 30 | 60 | 90;

export interface ExpiryRow {
    productName: string;
    batchNumber: string;
    expiryDate: string;
    daysLeft: number;
    currentStock: number;
    status: 'CRITICAL' | 'WARNING';
}

const parseISODateLocal = (iso: string): Date => {
    const [y, m, d] = iso.split('-').map(n => Number(n));
    return new Date(y, (m || 1) - 1, d || 1);
};

const startOfTodayLocal = (): Date => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

export const useExpiryAlerts = (filterDays: ExpiryFilter) => {
    const [rows, setRows] = useState<ExpiryRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        const fetchExpirydata = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // Fetch medicines directly from the backend
                const res = await api.get('/inventory/medicines');
                const medicines = res.data?.data || res.data || [];

                const products: Product[] = [];
                const batches: Batch[] = [];
                const inventory: any[] = [];

                medicines.forEach((m: any) => {
                    products.push({
                        id: m.id,
                        _local_id: m._local_id || m.id,
                        name: m.name,
                        composition: m.generic_name || m.composition || '',
                        manufacturer: m.manufacturer || '',
                        type: m.type || 'TABLET',
                        hsn_code: m.hsn_code || '',
                        gst_rate: Number(m.gst_rate || 0),
                        min_stock_alert: Number(m.low_stock_threshold || m.min_stock_alert || 5),
                        is_active: m.is_active === 1 || m.is_active === true,
                        created_at: m.created_at,
                        updated_at: m.updated_at,
                        last_modified: Date.now()
                    });

                    if (m.medicine_batches) {
                        m.medicine_batches.forEach((b: any) => {
                            const batchId = b._local_id || b.id;
                            batches.push({
                                id: batchId,
                                _local_id: batchId,
                                product_id: b.medicine_id || b.product_id || m.id,
                                purchase_id: b.purchase_id || '',
                                batch_number: b.batch_number,
                                mrp: Number(b.mrp || 0),
                                purchase_rate: Number(b.purchase_price || b.purchase_rate || 0),
                                sales_rate: Number(b.sales_rate || b.mrp || 0),
                                expiry_date: b.expiry_date || new Date().toISOString().split('T')[0],
                                created_at: b.created_at,
                                updated_at: b.updated_at,
                                last_modified: Date.now()
                            });

                            inventory.push({
                                id: batchId,
                                _local_id: batchId,
                                batch_id: batchId,
                                quantity: Number(b.quantity_remaining || 0),
                                location: b.location || 'RACK-1'
                            });
                        });
                    }
                });

                if (!mounted) return;

                const productById = new Map<string, Product>();
                products.forEach(p => productById.set(p.id, p));

                const qtyByBatchId = new Map<string, number>();
                inventory.forEach(inv => {
                    qtyByBatchId.set(inv.batch_id, (qtyByBatchId.get(inv.batch_id) ?? 0) + (inv.quantity ?? 0));
                });

                const today = startOfTodayLocal();
                const msPerDay = 24 * 60 * 60 * 1000;

                const computed: ExpiryRow[] = [];
                for (const b of batches) {
                    const expiry = parseISODateLocal(b.expiry_date);
                    const daysLeft = Math.floor((expiry.getTime() - today.getTime()) / msPerDay);

                    // Skip if filtered out by days (optimization) - No, let's filter in UI or Hook param?
                    // Hook takes `filterDays`. Let's filter here to save render time.
                    if (daysLeft > filterDays) continue;
                    // Also skip expired? The logic in original file was `daysLeft < 0 continue`.
                    // But maybe we want to show EXPIRED items too?
                    // Original: `if (daysLeft < 0) continue;`
                    if (daysLeft < 0) continue;

                    const currentStock = qtyByBatchId.get(b.id) ?? 0;
                    if (currentStock <= 0) continue;

                    const status: ExpiryRow['status'] = daysLeft <= 7 ? 'CRITICAL' : 'WARNING';

                    const productName = productById.get(b.product_id)?.name ?? 'Unknown Product';

                    computed.push({
                        productName,
                        batchNumber: b.batch_number,
                        expiryDate: b.expiry_date,
                        daysLeft,
                        currentStock,
                        status,
                    });
                }

                // Sort
                computed.sort((a, b) => {
                    // Critical first
                    if (a.status !== b.status) return a.status === 'CRITICAL' ? -1 : 1;
                    // Less days first
                    if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
                    return a.productName.localeCompare(b.productName);
                });

                setRows(computed);
            } catch (e: any) {
                if (mounted) setError(e?.message || 'Failed to load expiry alerts');
            } finally {
                if (mounted) setIsLoading(false);
            }
        };

        fetchExpirydata();

        return () => { mounted = false; };
    }, [filterDays]); // Re-fetch only if DB changes (not tracked here) or filterDays changes.

    return { rows, isLoading, error };
};
