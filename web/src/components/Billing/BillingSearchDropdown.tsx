import React, { useEffect, useId, useRef } from 'react';
import { Badge } from '../ui/Badge';
import type { SearchResult } from '../../services/productLookupService';

interface BillingSearchDropdownProps {
    results: SearchResult[];
    selectedIndex: number;
    onSelect: (result: SearchResult) => void;
    onHighlight?: (index: number) => void;
    isSearching?: boolean;
    allowOutOfStockSelection?: boolean;
    idPrefix?: string;
}

function sellingPrice(result: SearchResult): number {
    const batch = result.bestBatch;
    const price = Number(batch?.sales_rate || batch?.mrp || 0);
    return Number.isFinite(price) ? price : 0;
}

function formatPrice(amount: number): string {
    return amount.toLocaleString('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatExpiry(value: string | null): string {
    if (!value) return '';
    const [year, month] = value.slice(0, 10).split('-');
    const monthIndex = Number(month) - 1;
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (!year || monthIndex < 0 || monthIndex > 11) return value.slice(0, 10);
    return `${names[monthIndex]} ${year}`;
}

export const BillingSearchDropdown: React.FC<BillingSearchDropdownProps> = ({
    results,
    selectedIndex,
    onSelect,
    onHighlight,
    isSearching,
    allowOutOfStockSelection = false,
    idPrefix,
}) => {
    const generatedId = useId();
    const prefix = idPrefix || generatedId;
    const listRef = useRef<HTMLUListElement>(null);

    useEffect(() => {
        const selectedElement = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
        selectedElement?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    if (results.length === 0 && !isSearching) return null;

    if (results.length === 0 && isSearching) {
        return (
            <div className="absolute top-full left-0 right-0 mt-2 z-[100] rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted shadow-2xl" role="status">
                Searching medicines…
            </div>
        );
    }

    return (
        <div className="absolute top-full left-0 right-0 mt-2 z-[100] overflow-hidden rounded-xl border border-border bg-surface text-foreground shadow-2xl ring-1 ring-border/60">
            <ul
                id={`${prefix}-list`}
                ref={listRef}
                role="listbox"
                aria-label="Matching medicines"
                className="max-h-80 overflow-y-auto divide-y divide-border"
            >
                {results.map((result, index) => {
                    const isSelected = index === selectedIndex;
                    const isOutOfStock = result.totalStock <= 0;
                    const blocked = isOutOfStock && !allowOutOfStockSelection;
                    const price = sellingPrice(result);
                    const detail = [result.product.composition, result.product.manufacturer]
                        .filter(Boolean)
                        .join(' · ');
                    const expiry = formatExpiry(result.nearestExpiry);

                    return (
                        <li
                            key={result.product.id}
                            id={`${prefix}-option-${index}`}
                            role="option"
                            aria-selected={isSelected}
                            aria-disabled={blocked || undefined}
                            onMouseEnter={() => onHighlight?.(index)}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                if (!blocked) onSelect(result);
                            }}
                            className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 transition-colors
                                ${isSelected ? 'bg-primary/10' : 'hover:bg-surface-elevated'}
                                ${blocked ? 'cursor-not-allowed opacity-60' : ''}
                            `}
                        >
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground-strong">
                                    {result.product.name}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-muted">
                                    {detail || 'No composition listed'}
                                </p>
                            </div>
                            <div className="text-right">
                                {price > 0 && (
                                    <p className="text-sm font-semibold tabular-nums text-foreground-strong">
                                        {formatPrice(price)}
                                    </p>
                                )}
                                {isOutOfStock ? (
                                    <Badge variant="danger" className="mt-1">Out of stock</Badge>
                                ) : (
                                    <p className="mt-0.5 text-xs text-muted">
                                        {result.totalStock} in stock{expiry ? ` · exp ${expiry}` : ''}
                                    </p>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
            <p className="border-t border-border bg-surface-elevated px-3 py-2 text-[11px] text-muted">
                ↑ ↓ to move · Enter to add
            </p>
        </div>
    );
};
