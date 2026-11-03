import * as Print from 'expo-print';

export async function printReceiptHtml(html: string | undefined | null): Promise<void> {
  const trimmed = html?.trim() ?? '';
  if (!trimmed || trimmed === '<p>Invoice not available</p>') {
    throw new Error('Invoice not available yet');
  }
  await Print.printAsync({ html: trimmed });
}
