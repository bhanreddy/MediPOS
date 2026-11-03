import api from "../lib/api";
import type { Supplier } from "../core/types";

async function fetchSuppliers(): Promise<Supplier[]> {
  const suppliers: Supplier[] = [];
  for (let page = 1; page <= 100; page++) {
    const { data } = await api.get('/suppliers', { params: { page, limit: 100 } });
    suppliers.push(...(data.data || []));
    if (!data.pagination || page >= data.pagination.totalPages) return suppliers;
  }
  throw new Error('This supplier directory is too large to load. Please contact support.');
}

export const SupplierService = {
  getAll: fetchSuppliers,
  async getActive(): Promise<Supplier[]> {
    return (await fetchSuppliers()).filter(supplier => supplier.is_active !== false);
  },

  async addSupplier(
    data: Pick<Supplier, "name"> &
      Partial<Pick<Supplier, "gstin" | "phone" | "email" | "address">>,
  ): Promise<Supplier> {
    const res = await api.post("/suppliers", data);
    const created = res.data?.data;
    return {
      ...created,
      id: created._local_id || created.id,
    };
  },

  async updateSupplier(id: string, updates: Partial<Supplier>): Promise<void> {
    await api.put(`/suppliers/${id}`, updates);
  },

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    await this.updateSupplier(id, { is_active: isActive });
  },
};
