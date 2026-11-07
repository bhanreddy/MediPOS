import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../lib/api';

export interface PrescriptionCheckout {
  id: string;
  signed: boolean;
  annotated: boolean;
  prescriptionRegister: string;
  h1Register: string;
  xPage: string;
  xDuplicate: string;
}
export const emptyPrescriptionCheckout: PrescriptionCheckout = {
  id: '', signed: false, annotated: false, prescriptionRegister: '', h1Register: '', xPage: '', xDuplicate: '',
};

export function CounterPrescriptionFields({ customerId, value, onChange, needsGeneral, needsH1, needsX }: {
  customerId: string | null;
  value: PrescriptionCheckout;
  onChange: (value: PrescriptionCheckout) => void;
  needsGeneral: boolean;
  needsH1: boolean;
  needsX: boolean;
}) {
  const prescriptions = useQuery({
    queryKey: ['counter-prescriptions', customerId],
    enabled: !!customerId,
    queryFn: async () => (await api.get('/dispensing/prescriptions', { params: { patient_id: customerId } })).data.data as Array<{ id: string; prescription_number: string; external_rx_number?: string; doctor_name_snapshot: string }>,
  });
  const update = (key: keyof PrescriptionCheckout, next: string | boolean) => onChange({ ...value, [key]: next });
  const input = 'mt-1 block w-full rounded-lg border border-border bg-surface p-2';

  return <section className="space-y-3 rounded-lg border border-warning/40 p-3" aria-label="Verified prescription">
    <h3 className="font-semibold">Verified prescription</h3>
    {!customerId && <p className="text-sm text-muted">Select the patient on the bill first.</p>}
    {customerId && <label className="block text-sm">Prescription for this patient
      <select className={input} value={value.id} onChange={event => onChange({ ...emptyPrescriptionCheckout, id: event.target.value })}>
        <option value="">Choose a verified prescription</option>
        {prescriptions.data?.map(rx => <option key={rx.id} value={rx.id}>{rx.external_rx_number || rx.prescription_number} · {rx.doctor_name_snapshot}</option>)}
      </select>
    </label>}
    {prescriptions.isError && <p role="alert" className="text-sm text-danger">Unable to load verified prescriptions.</p>}
    {customerId && prescriptions.data?.length === 0 && <p className="text-sm text-muted">This patient has no available verified prescriptions.</p>}
    {value.id && <>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={value.signed} onChange={event => update('signed', event.target.checked)} />I checked the dated, signed prescription and the exact medicine, dose and quantity</label>
      {needsGeneral && <label className="block text-sm">Signed prescription register entry
        <input className={input} maxLength={100} value={value.prescriptionRegister} onChange={event => update('prescriptionRegister', event.target.value)} />
      </label>}
      {needsH1 && <label className="block text-sm">Separate Schedule H1 register entry
        <input className={input} maxLength={100} value={value.h1Register} onChange={event => update('h1Register', event.target.value)} />
      </label>}
      {needsX && <>
        <label className="block text-sm">Schedule X bound register page and entry
          <input className={input} maxLength={100} value={value.xPage} onChange={event => update('xPage', event.target.value)} />
        </label>
        <label className="block text-sm">Retained duplicate prescription reference
          <input className={input} maxLength={100} value={value.xDuplicate} onChange={event => update('xDuplicate', event.target.value)} />
        </label>
      </>}
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={value.annotated} onChange={event => update('annotated', event.target.checked)} />I signed the applicable register and marked the prescription with the supply details</label>
    </>}
    <Link to="/prescriptions" className="text-sm font-semibold text-primary">Open prescription queue</Link>
  </section>;
}
