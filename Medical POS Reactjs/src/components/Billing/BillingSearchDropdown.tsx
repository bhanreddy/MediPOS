import React, { useEffect, useRef } from 'react';
import { Badge } from '../ui/Badge';
import type { SearchResult } from '../../services/productLookupService';

interface BillingSearchDropdownProps {
    results: SearchResult[];
    selectedIndex: number;
    onSelect: (result: SearchResult) => void;

    isSearching?: boolean;
    allowOutOfStockSelection?: boolean;
}


export const BillingSearchDropdown: React.FC<BillingSearchDropdownProps> = ({
    results,
    selectedIndex,
    onSelect,
    isSearching,
    allowOutOfStockSelection = false
}) => {
    const listRef = useRef<HTMLUListElement>(null);

    // Auto-scroll to selected item
    useEffect(() => {
        if (listRef.current) {
            const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selectedIndex]);

    if (results.length === 0 && !isSearching) return null;

    if (results.length === 0 && isSearching) {
        return (
            <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-border rounded-lg shadow-xl p-4 text-center z-50">
                <span className="text-sm font-bold text-muted animate-pulse">Searching Catalogue...</span>
            </div>
        );
    }

    return (
        <ul
            ref={listRef}
            className="absolute top-full left-0 right-0 mt-2 bg-surface text-foreground border border-border rounded-lg shadow-2xl max-h-80 overflow-y-auto z-50 divide-y divide-border"
        >
            {results.map((result, index) => {
                const isSelected = index === selectedIndex;
                const isOutOfStock = result.totalStock <= 0;

                return (
                    <li
                        key={result.product.id}
                        onMouseDown={(e) => {
                            e.preventDefault(); // Prevent focus loss on input
                            if (allowOutOfStockSelection || !isOutOfStock) onSelect(result);
                        }}
                        className={`p-3 flex items-center justify-between cursor-pointer transition-colors
                            ${isSelected ? 'bg-primary/10' : 'hover:bg-surface-elevated'}
                            ${isOutOfStock && !allowOutOfStockSelection ? 'opacity-60 grayscale cursor-not-allowed' : ''}
                        `}
                    >
                        <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-sm text-foreground-strong">
                                {result.product.name}
                            </span>
                            <span className="text-xs text-muted">
                                {result.product.composition || 'No Composition'}
                            </span>
                            <span className="text-[10px] text-muted uppercase tracking-wider">
                                {result.product.manufacturer}
                            </span>
                        </div>

                        <div className="text-right flex flex-col items-end gap-1">
                            {isOutOfStock ? (
                                <Badge variant="danger">OUT OF STOCK</Badge>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-muted">
                                        EXP: {result.nearestExpiry}
                                    </span>
                                    <Badge variant="success">
                                        {result.totalStock} UNITS
                                    </Badge>
                                </div>
                            )}
                            {isSelected && !isOutOfStock && (
                                <span className="text-[10px] font-black text-primary uppercase tracking-widest animate-pulse">
                                    Press Enter
                                </span>
                            )}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
};
