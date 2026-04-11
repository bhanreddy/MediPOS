import { create } from 'zustand';

interface AlertState {
  lowStockCount: number;
  expiryCount: number;
  shortbookCount: number;
  setAlerts: (counts: { lowStockCount: number; expiryCount: number; shortbookCount: number }) => void;
  clearAlerts: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  lowStockCount: 0,
  expiryCount: 0,
  shortbookCount: 0,
  setAlerts: (counts) => set({ ...counts }),
  clearAlerts: () => set({ lowStockCount: 0, expiryCount: 0, shortbookCount: 0 }),
}));
