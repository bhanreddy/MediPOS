export const GST_RATES = [0, 5, 12, 18, 28] as const;
export type GstRate = typeof GST_RATES[number];
