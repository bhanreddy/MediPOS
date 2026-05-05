import { queryOne } from '../lib/localQuery';

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
    const row = await queryOne<Record<string, any>>('clinics', '1=1');
    if (!row) {
      return {
        id: 'local',
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
    return {
      id: String(row.id ?? row._local_id ?? ''),
      name: String(row.name ?? ''),
      owner_name: String(row.owner_name ?? ''),
      email: String(row.email ?? ''),
      phone: String(row.phone ?? ''),
      address: String(row.address ?? ''),
      gstin: String(row.gstin ?? ''),
      drug_licence_number: String(row.drug_licence_number ?? ''),
      logo_url: row.logo_url ? String(row.logo_url) : null,
      signature_url: row.signature_url ? String(row.signature_url) : null,
      invoice_footer: row.invoice_footer ? String(row.invoice_footer) : null,
      plan: String(row.plan ?? 'free'),
      is_active: Boolean(row.is_active),
    };
  },
};
