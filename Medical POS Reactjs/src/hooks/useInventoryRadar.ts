import { useState, useEffect } from 'react';
import {
    buildRadarItemsWithStats,
    matchesAttentionFilter,
} from '../services/inventoryRadarCore';
import type { RadarItem, InventoryAttentionFilter } from '../services/inventoryRadarCore';

export type { RadarItem, InventoryAttentionFilter };

export interface InventoryStats {
    totalAssets: number;
    criticalStock: number;
    nearExpiry: number;
    netValuation: number;
}

export const useInventoryRadar = (searchTerm: string, attentionFilter?: InventoryAttentionFilter | null) => {
    const [items, setItems] = useState<RadarItem[]>([]);
    const [stats, setStats] = useState<InventoryStats>({
        totalAssets: 0,
        criticalStock: 0,
        nearExpiry: 0,
        netValuation: 0,
    });
    const [isLoading, setIsLoading] = useState(true);
    const [version, setVersion] = useState(0);

    const refresh = () => setVersion(v => v + 1);

    useEffect(() => {
        const fetchInventory = async () => {
            setIsLoading(true);
            try {
                const { items: radarItems, stats: nextStats } = await buildRadarItemsWithStats();

                const filtered = radarItems
                    .filter(item => matchesAttentionFilter(item, attentionFilter ?? null))
                    .filter(
                        item =>
                            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            item.batch.toLowerCase().includes(searchTerm.toLowerCase()),
                    )
                    .sort((a, b) => b.priority - a.priority);

                setItems(filtered);
                setStats(nextStats);
            } catch (error) {
                console.error('Inventory Radar failed', error);
            } finally {
                setIsLoading(false);
            }
        };

        const timer = setTimeout(fetchInventory, 300);
        return () => clearTimeout(timer);
    }, [searchTerm, version, attentionFilter]);

    return { items, stats, isLoading, refresh };
};
