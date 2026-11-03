/**
 * Custom error thrown when a sale cannot be fulfilled
 * because the requested quantity exceeds available stock.
 */
export class InsufficientStockError extends Error {
    productId: string;
    missing: number;
    available: number;
    requested: number;
    productName?: string;

    constructor(productId: string, missing: number, available: number, requested: number) {
        super(`Insufficient stock for Product ${productId}. Missing ${missing}`);
        this.name = 'InsufficientStockError';
        this.productId = productId;
        this.missing = missing;
        this.available = available;
        this.requested = requested;
    }
}
