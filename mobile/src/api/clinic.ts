import { apiClient } from './client';

export interface ClinicProfile {
  id: string;
  name: string;
  owner_name: string;
  email: string;
  phone: string;
  address: string;
  gstin: string;
  drug_licence_number: string;
  logo_url: string | null;
  signature_url: string | null;
  invoice_footer: string | null;
  plan: string;
  is_active: boolean;
}

export const clinicApi = {
  getProfile: async (): Promise<ClinicProfile> => {
    try {
      const res = await apiClient.get('/clinics/me');
      const raw = res.data.data ?? res.data;
      return {
        id: String(raw.id ?? ''),
        name: String(raw.name ?? 'My Medical Store'),
        owner_name: String(raw.owner_name ?? ''),
        email: String(raw.email ?? ''),
        phone: String(raw.phone ?? ''),
        address: String(raw.address ?? ''),
        gstin: String(raw.gstin ?? ''),
        drug_licence_number: String(raw.drug_licence_number ?? ''),
        logo_url: raw.logo_url ? String(raw.logo_url) : null,
        signature_url: raw.signature_url ? String(raw.signature_url) : null,
        invoice_footer: raw.invoice_footer ? String(raw.invoice_footer) : null,
        plan: String(raw.plan ?? 'free'),
        is_active: Boolean(raw.is_active ?? true),
      };
    } catch {
      // Fallback: return default profile
      return {
        id: 'remote',
        name: 'My Medical Store',
        owner_name: '',
        email: '',
        phone: '',
        address: '',
        gstin: '',
        drug_licence_number: '',
        logo_url: null,
        signature_url: null,
        invoice_footer: null,
        plan: 'free',
        is_active: true,
      };
    }
  },
};
