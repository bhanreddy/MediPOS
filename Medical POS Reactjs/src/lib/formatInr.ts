export function formatInr(amount: number, maximumFractionDigits = 0): string {
    return amount.toLocaleString('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits,
    });
}
