import { forEachAsync } from '../../lib/businessDb';
import { businessDb as localDb } from '../../lib/businessDb';
import { DispensingEvent, PatientAllergy, Prescription } from '../../domain/prescriptionTypes';

export interface PatientMedicationHistory {
  patientId: string;
  patientName?: string;
  allergies: PatientAllergy[];
  prescriptions: Prescription[];
  dispensingTimeline: DispensingEvent[];
  activeMedications: Array<{
    medicineId: string;
    medicineName: string;
    lastDispensedAt: string;
    quantityDispensed: number;
    sourceLabel: string;
  }>;
}

export class PatientMedicationHistoryService {
  static async getPatientHistory(patientId: string, organizationId?: string): Promise<PatientMedicationHistory> {
    const cust: any = (await localDb
      .prepare('SELECT * FROM customers WHERE (id = ? OR _local_id = ?) AND _deleted = 0' + (organizationId ? ' AND (organization_id = ? OR clinic_id = ?)' : ''))
      .get(patientId, patientId, ...(organizationId ? [organizationId, organizationId] : [])));

    const allergies: any[] = (await localDb
      .prepare('SELECT * FROM patient_allergies WHERE patient_id = ? AND active = 1 AND _deleted = 0' + (organizationId ? ' AND organization_id = ?' : '') + ' ORDER BY created_at DESC')
      .all(patientId, ...(organizationId ? [organizationId] : [])));

    const rxRows: any[] = (await localDb
      .prepare('SELECT * FROM prescriptions WHERE patient_id = ? AND _deleted = 0' + (organizationId ? ' AND organization_id = ?' : '') + ' ORDER BY created_at DESC')
      .all(patientId, ...(organizationId ? [organizationId] : [])));

    (await forEachAsync(rxRows, async (rx) => {
      const items: any[] = (await localDb
        .prepare('SELECT * FROM prescription_items WHERE prescription_id = ? AND _deleted = 0 ORDER BY sequence ASC')
        .all(rx.id || rx._local_id));
      rx.items = items;
    }));

    const dispensingRows: any[] = (await localDb
      .prepare(
        `SELECT d.* FROM dispensing_events d
         JOIN prescriptions p ON d.prescription_id = (p.id) OR d.prescription_id = (p._local_id)
         WHERE p.patient_id = ? AND d._deleted = 0 ${organizationId ? 'AND p.organization_id = ?' : ''}
         ORDER BY d.dispensed_at DESC`
      )
      .all(patientId, ...(organizationId ? [organizationId] : [])));

    // Derive active medications list (recent 60 days)
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const activeMedsMap = new Map<string, any>();

    (await forEachAsync(dispensingRows, async (de) => {
      if (de.dispensed_at >= sixtyDaysAgo && !activeMedsMap.has(de.product_id)) {
        const med: any = (await localDb
          .prepare('SELECT name FROM medicines WHERE id = ? OR _local_id = ?')
          .get(de.product_id, de.product_id));

        activeMedsMap.set(de.product_id, {
          medicineId: de.product_id,
          medicineName: med?.name || 'Unknown Product',
          lastDispensedAt: de.dispensed_at,
          quantityDispensed: de.quantity_dispensed,
          sourceLabel: 'based on recorded dispensing history',
        });
      }
    }));

    return {
      patientId,
      patientName: cust?.name || 'Patient',
      allergies: allergies as PatientAllergy[],
      prescriptions: rxRows as Prescription[],
      dispensingTimeline: dispensingRows as DispensingEvent[],
      activeMedications: Array.from(activeMedsMap.values()),
    };
  }
}
