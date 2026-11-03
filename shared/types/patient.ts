export interface Patient {
  id: string;
  clinic_id: string;
  name: string;
  phone?: string | null;
  dob?: string | null;
  gender?: 'male' | 'female' | 'other' | null;
  address?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}
