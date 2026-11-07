import { businessDb as localDb } from '../../lib/businessDb';
import { localMutate } from '../../lib/localMutate';
import { Doctor } from '../../domain/prescriptionTypes';
import { v4 as uuidv4 } from 'uuid';

export class DoctorService {
  static async createDoctor(params: {
    organizationId?: string | null;
    name: string;
    registrationNumber: string;
    registrationAuthority?: string;
    specialization?: string;
    phone?: string;
    clinicHospital?: string;
    address?: string;
  }): Promise<Doctor> {
    const id = uuidv4();
    const cleanReg = params.registrationNumber.trim().toUpperCase();

    const record = (await localMutate({
      table: 'doctors',
      operation: 'INSERT',
      data: {
        id,
        _local_id: id,
        organization_id: params.organizationId || null,
        name: params.name.trim(),
        registration_number: cleanReg,
        registration_authority: params.registrationAuthority || null,
        specialization: params.specialization || null,
        phone: params.phone || null,
        clinic_hospital: params.clinicHospital || null,
        address: params.address || null,
        active: 1,
        created_at: new Date().toISOString(),
      },
    }));

    return record as Doctor;
  }

  static async getDoctorById(id: string): Promise<Doctor | null> {
    const doc: any = (await localDb
      .prepare('SELECT * FROM doctors WHERE (id = ? OR _local_id = ?) AND _deleted = 0')
      .get(id, id));
    return doc || null;
  }

  static async getDoctors(params: { organizationId?: string | null; query?: string }): Promise<Doctor[]> {
    const { organizationId, query } = params;
    let sql = 'SELECT * FROM doctors WHERE _deleted = 0 AND active = 1';
    const sqlParams: any[] = [];

    if (organizationId) {
      sql += ' AND organization_id = ?';
      sqlParams.push(organizationId);
    }

    if (query && query.trim().length > 0) {
      sql += ' AND (UPPER(name) LIKE ? OR UPPER(registration_number) LIKE ?)';
      const term = `%${query.trim().toUpperCase()}%`;
      sqlParams.push(term, term);
    }

    sql += ' ORDER BY name ASC LIMIT 100';
    return (await localDb.prepare(sql).all(...sqlParams)) as Doctor[];
  }

  static async findOrCreateByRegistration(params: {
    organizationId?: string | null;
    name: string;
    registrationNumber: string;
  }): Promise<Doctor> {
    const cleanReg = params.registrationNumber.trim().toUpperCase();
    const existing: any = (await localDb
      .prepare('SELECT * FROM doctors WHERE UPPER(registration_number) = ? AND _deleted = 0 AND ' + (params.organizationId ? 'organization_id = ?' : 'organization_id IS NULL'))
      .get(cleanReg, ...(params.organizationId ? [params.organizationId] : [])));

    if (existing) {
      return existing as Doctor;
    }

    return (await this.createDoctor({
      organizationId: params.organizationId,
      name: params.name,
      registrationNumber: cleanReg,
    }));
  }
}
