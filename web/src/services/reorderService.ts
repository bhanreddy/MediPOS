import api from "../lib/api";
import type { Supplier } from "../core/types";

export interface ReorderCandidate {
  medicineId: string;
  medicineName: string;
  genericName: string;
  unit: string;
  availableStock: number;
  incomingStock: number;
  dailyDemand: number;
  daysCover: number | null;
  recommendedQuantity: number;
  requestedQuantity: number;
  leadTimeDays: number;
  reorderPoint: number;
  supplierId: string;
  lastPrice: number | null;
  expiringStock: number;
  priority: "critical" | "urgent" | "planned";
  reason: string;
  quotes: { supplier_id: string; price: number; observed_at: string }[];
}
export interface ReorderWorkspace {
  candidates: ReorderCandidate[];
  suppliers: Supplier[];
  openOrderCount: number;
  generatedAt: string;
}
export interface ReorderDraft {
  id: string;
  po_number: string;
  supplier_name: string;
  supplier_id: string;
  status: "DRAFT" | "SENT" | "PARTIAL" | "CLOSED" | "CANCELLED";
  body: string;
  channel: "MANUAL" | "WHATSAPP" | "SMS";
  lines_json?: string;
}
export interface ReorderDraftInput {
  request_id: string;
  budget?: number;
  notes: string;
  lines: { medicine_id: string; supplier_id: string; quantity: number }[];
}
export const ReorderService = {
  async workspace(signal?: AbortSignal): Promise<ReorderWorkspace> {
    return (await api.get("/shortbook/workspace", { signal })).data.data;
  },
  async drafts(): Promise<ReorderDraft[]> {
    return (await api.get("/shortbook/order-drafts")).data.data;
  },
  async getDraft(id: string): Promise<ReorderDraft> {
    return (await api.get(`/shortbook/order-drafts/${id}`)).data.data;
  },
  async createDrafts(input: ReorderDraftInput): Promise<ReorderDraft[]> {
    return (await api.post("/shortbook/draft-orders", input)).data.data;
  },
  async cancelDraft(id: string): Promise<void> {
    await api.post(`/shortbook/order-drafts/${id}/cancel`);
  },
};
