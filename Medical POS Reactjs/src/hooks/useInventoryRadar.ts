import { useState, useEffect } from 'react';
import { db } from '../db/index';
import type { Product, Batch } from '../core/types';
import { RADAR_CONFIG } from '../config/appContent';

export interface RadarItem {
    id: string; // Product ID or Batch ID? Let's use Batch ID for uniqueness in row
    productId: string;
    name: string;
    batch: string;
    expiry: string;
    qty: number;
    status: 'CRITICAL' | 'LOW_STOCK' | 'NORMAL';
    priority: number;
}

export interface InventoryStats {
    totalAssets: number; // Count of batches or total value? Label says "Total Assets" (Items?)
    criticalStock: number;
    nearExpiry: number;
    netValuation: number; // Value in INR
}

export const useInventoryRadar = (searchTerm: string) => {
    const [items, setItems] = useState<RadarItem[]>([]);
    const [stats, setStats] = useState<InventoryStats>({
        totalAssets: 0,
        criticalStock: 0,
        nearExpiry: 0,
        netValuation: 0
    });
    const [isLoading, setIsLoading] = useState(true);
    const [version, setVersion] = useState(0); // For manual refresh

    const refresh = () => setVersion(v => v + 1);

    useEffect(() => {
        const fetchInventory = async () => {
            setIsLoading(true);
            try {
                // Fetch all raw data (Optimized: Join locally)
                // 1. Inventory
                const inventory = await db.inventory.toArray();

                // 2. Batches
                const batchIds = inventory.map(i => i.batch_id);
                const batches = await db.batches.bulkGet(batchIds);
                const batchMap = new Map<string, Batch>();
                batches.forEach(b => { if (b) batchMap.set(b.id, b); });

                // 3. Products
                const productIds = Array.from(new Set(batches.map(b => b?.product_id).filter(Boolean))) as string[];
                const products = await db.products.bulkGet(productIds);
                const productMap = new Map<string, Product>();
                products.forEach(p => { if (p) productMap.set(p.id, p); });

                // Processing
                const radarItems: RadarItem[] = [];
                let totalAssets = 0;
                let criticalCount = 0;
                let nearExpiryCount = 0;
                let valuation = 0;

                const today = new Date();
                const warningDate = new Date();
                warningDate.setDate(today.getDate() + RADAR_CONFIG.expiryWarningDays);
                const warningStr = warningDate.toISOString().split('T')[0];
                const todayStr = today.toISOString().split('T')[0];

                for (const inv of inventory) {
                    const batch = batchMap.get(inv.batch_id);
                    const product = productMap.get(batch?.product_id || '');

                    if (!batch || !product) continue;
                    if (inv.quantity <= 0) continue;

                    const minAlert = Math.max(1, product.min_stock_alert ?? 10);
                    const criticalQtyThreshold = Math.max(1, Math.floor(minAlert * 0.5));

                    let status: RadarItem['status'] = 'NORMAL';
                    let priority = 0;

                    if (batch.expiry_date < todayStr) {
                        status = 'CRITICAL';
                        priority = 1500;
                        criticalCount++;
                    } else if (inv.quantity <= criticalQtyThreshold) {
                        status = 'CRITICAL';
                        priority = 100;
                        criticalCount++;
                    } else if (inv.quantity < minAlert) {
                        status = 'LOW_STOCK';
                        priority = 80;
                    } else if (batch.expiry_date <= warningStr) {
                        status = 'LOW_STOCK';
                        priority = 50;
                        nearExpiryCount++;
                    } else {
                        status = 'NORMAL';
                        priority = 0;
                    }

                    totalAssets += inv.quantity;
                    valuation += (inv.quantity * batch.purchase_rate); // Cost Valuation

                    radarItems.push({
                        id: inv.id, // Inventory ID
                        productId: product.id,
                        name: product.name,
                        batch: batch.batch_number,
                        expiry: batch.expiry_date,
                        qty: inv.quantity,
                        status,
                        priority
                    });
                }

                // Filter & Sort
                const filtered = radarItems.filter(item =>
                    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    item.batch.toLowerCase().includes(searchTerm.toLowerCase())
                ).sort((a, b) => b.priority - a.priority);

                setItems(filtered);
                setStats({
                    totalAssets,
                    criticalStock: criticalCount,
                    nearExpiry: nearExpiryCount,
                    netValuation: valuation
                });

            } catch (error) {
                console.error("Inventory Radar failed", error);
            } finally {
                setIsLoading(false);
            }
        };

        const timer = setTimeout(fetchInventory, 300); // Debounce search slightly
        return () => clearTimeout(timer);
    }, [searchTerm, version]);

    return { items, stats, isLoading, refresh };
};
