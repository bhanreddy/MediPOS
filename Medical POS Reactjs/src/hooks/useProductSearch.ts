import { useState, useEffect } from 'react';
import { db } from '../db/index';
import type { Product, Batch } from '../core/types';
import {
    computeSearchResultForProduct,
    readAllowExpiredSale,
    type SearchResult,
} from '../services/productLookupService';

export type { SearchResult };

export const useProductSearch = (query: string) => {
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [debouncedQuery, setDebouncedQuery] = useState(query);

    // 1. Debounce the input (150ms)
    // This prevents the search from firing on every keystroke during fast typing
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedQuery(query);
        }, 150);
        return () => clearTimeout(handler);
    }, [query]);

    // 2. React to debounced input
    useEffect(() => {
        const trimmed = debouncedQuery.trim();

        // SCANNER DETECTION RULE for Sticky Search:
        // If numeric and >= 3 chars, assume it's a barcode scan attempt.
        // We do NOT search in that case to avoid UI flicker during scan.
        const isNumeric = /^\d+$/.test(trimmed);

        // Clear results ONLY if:
        // 1. Input is empty
        // 2. Input is too short (< 2 chars) for meaningful search
        // 3. Input is a barcode scan (numeric >= 3)
        if (!trimmed || trimmed.length < 2 || (isNumeric && trimmed.length >= 3)) {
            setResults([]);
            return;
        }

        const runSearch = async () => {
            setIsSearching(true);
            // NOTE: We do NOT clear results here.
            // Keeping old results while fetching new ones prevents "blink" (Flicker).

            try {
                // 1. Find Products (Name or Composition)
                const products = await db.products
                    .filter((p: Product) =>
                        p.is_active && (
                            p.name.toLowerCase().includes(trimmed.toLowerCase()) ||
                            p.composition.toLowerCase().includes(trimmed.toLowerCase())
                        )
                    )
                    .limit(10)
                    .toArray();

                if (products.length === 0) {
                    setResults([]);
                    return;
                }

                // 2. For matched products, find Stock & Batches
                const productIds = products.map((p: Product) => p.id);
                const batches = await db.batches
                    .where('product_id')
                    .anyOf(productIds)
                    .toArray();

                const inventory = await db.inventory
                    .where('batch_id')
                    .anyOf(batches.map((b: Batch) => b.id))
                    .toArray();

                // 3. Map structure for fast lookup
                const inventoryMap = new Map<string, number>(); // batch_id -> quantity
                for (const inv of inventory) {
                    const current = inventoryMap.get(inv.batch_id) || 0;
                    inventoryMap.set(inv.batch_id, current + inv.quantity);
                }

                const today = new Date().toISOString().split('T')[0];
                const allowExpired = await readAllowExpiredSale();

                // 4. Aggregate Results (FEFO among batches with stock — same as finalize allocation)
                const searchResults: SearchResult[] = products.map((product: Product) => {
                    const productBatches = batches.filter((b: Batch) => b.product_id === product.id);
                    return computeSearchResultForProduct(product, productBatches, inventoryMap, allowExpired, today);
                });

                // Rule: Sort by In-Stock first, then Name
                searchResults.sort((a, b) => {
                    if (a.totalStock > 0 && b.totalStock <= 0) return -1;
                    if (a.totalStock <= 0 && b.totalStock > 0) return 1;
                    return a.product.name.localeCompare(b.product.name);
                });

                setResults(searchResults); // Atomic replacement
            } catch (error) {
                console.error("Search failed", error);
                setResults([]);
            } finally {
                setIsSearching(false);
            }
        };

        void runSearch();

    }, [debouncedQuery]);

    return { results, isSearching };
};
