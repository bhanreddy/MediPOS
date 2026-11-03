export function formatInr(amount: number | null | undefined, maximumFractionDigits = 0): string {
    return Number(amount ?? 0).toLocaleString('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits,
    });
}
