import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

type Credential = {
  id: string; full_name: string; registration_number?: string;
  registration_authority?: string; valid_until?: string; active?: boolean;
};
type Settings = { enabled: boolean; schedule_x_licence?: string; schedule_x_secure_storage?: boolean };
const input = 'mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2';
const failure = (error: any) => error.response?.data?.error?.message || 'Unable to save dispensing setup.';

function PharmacistCredential({ row }: { row: Credential }) {
  const [number, setNumber] = useState(row.registration_number ?? '');
  const [authority, setAuthority] = useState(row.registration_authority ?? '');
  const [expiry, setExpiry] = useState(row.valid_until?.slice(0, 10) ?? '');
  const [active, setActive] = useState(row.active ?? true);
  const [checked, setChecked] = useState(false);
  const [message, setMessage] = useState('');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    try {
      await api.put(`/dispensing/pharmacists/${row.id}`, {
        registration_number: number, registration_authority: authority, valid_until: expiry || null, active, verified_original: checked,
      });
      setMessage('Registration saved.');
    } catch (error) { setMessage(failure(error)); }
  }

  return <form className="space-y-2 rounded-lg border border-border p-3" onSubmit={save}>
    <h4 className="font-semibold">{row.full_name}</h4>
    <label className="block text-sm">Pharmacy Council registration number
      <input className={input} required maxLength={100} value={number} onChange={event => setNumber(event.target.value)} />
    </label>
    <label className="block text-sm">Registration authority
      <input className={input} required maxLength={150} value={authority} onChange={event => setAuthority(event.target.value)} />
    </label>
    <label className="block text-sm">Registration expiry, if applicable
      <input className={input} type="date" value={expiry} onChange={event => setExpiry(event.target.value)} />
    </label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />Active at this store</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" required checked={checked} onChange={event => setChecked(event.target.checked)} />I checked the registration record</label>
    <Button type="submit" variant="secondary">Save pharmacist</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>;
}

function SetupForm({ settings }: { settings: Settings | null }) {
  const [enabled, setEnabled] = useState(settings?.enabled ?? false);
  const [confirmed, setConfirmed] = useState(false);
  const [licence, setLicence] = useState(settings?.schedule_x_licence ?? '');
  const [secured, setSecured] = useState(settings?.schedule_x_secure_storage ?? false);
  const [message, setMessage] = useState('');
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    try {
      await api.put('/dispensing/setup', {
        enabled, physical_records_confirmed: confirmed, schedule_x_licence: licence.trim() || null, schedule_x_secure_storage: secured,
      });
      setMessage('Dispensing setup saved.');
    } catch (error) { setMessage(failure(error)); }
  }

  return <form onSubmit={save} className="space-y-2">
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />Enable regulated checkout at this store</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" required={enabled} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
      The licensed premises, signed physical registers, and pharmacist supervision are in place
    </label>
    <label className="block text-sm">Schedule X Form 20F number
      <input className={input} value={licence} maxLength={100} onChange={event => setLicence(event.target.value)} />
    </label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={secured} onChange={event => setSecured(event.target.checked)} />
      Schedule X has secured storage, a duplicate-prescription archive, and a bound numbered register
    </label>
    <Button type="submit">Save store setup</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>;
}

export function DispensingSetupDialog({ onClose }: { onClose: () => void }) {
  const setup = useQuery({
    queryKey: ['dispensing-setup'],
    queryFn: async () => (await api.get('/dispensing/setup')).data.data as { settings: Settings | null; pharmacists: Credential[] },
  });
  return <Modal isOpen onClose={onClose} title="Dispensing setup">
    {setup.isPending && <p>Loading store settings…</p>}
    {setup.isError && <p role="alert" className="text-danger">Unable to load dispensing settings.</p>}
    {setup.data && <div className="space-y-4">
      <SetupForm settings={setup.data.settings} />
      <h3 className="font-semibold">Registered pharmacists</h3>
      {setup.data.pharmacists.map(row => <PharmacistCredential key={row.id} row={row} />)}
      {setup.data.pharmacists.length === 0 && <p className="text-sm">Assign a pharmacist to this store first.</p>}
    </div>}
  </Modal>;
}
