export type ClinicPlan = 'trial' | 'basic' | 'pro';
export type UserRole = 'owner' | 'doctor' | 'pharmacist' | 'receptionist';

export interface Clinic {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  gstin?: string | null;
  subscription_id?: string | null;
  plan: ClinicPlan;
  trial_ends_at?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface ClinicUser {
  id: string;
  clinic_id: string;
  email: string;
  role: UserRole;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface JwtPayload {
  sub: string;
  clinic_id: string;
  role: UserRole;
  plan: ClinicPlan;
  exp: number;
}
