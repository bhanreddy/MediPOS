import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../lib/auth';
import { DispensingSetupDialog } from './DispensingSetupDialog';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../lib/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { FileText, UserCheck, Filter } from 'lucide-react';
import { PrescriptionReviewWorkspace } from './PrescriptionReviewWorkspace';

const emptyForm = {
  doctor_name: '', doctor_registration_number: '', doctor_address: '', written_date: '',
  external_rx_number: '', patient_id: '',
};
const emptyItem = { name: '', quantity: '', dose: '' };

export const PrescriptionQueuePage: React.FC = () => {
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('NEEDS_REVIEW');
  const [selectedRx, setSelectedRx] = useState<any | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const queueGeneration = useRef(0);
  const [uploadForm, setUploadForm] = useState(emptyForm);
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [patientSearch, setPatientSearch] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const role = useAuth(state => state.role);
  const patients = useQuery({
    queryKey: ['prescription-patients', patientSearch.trim()],
    enabled: showUploadModal && patientSearch.trim().length >= 2,
    queryFn: async () => (await api.get('/customers', { params: { q: patientSearch.trim(), limit: 15 } })).data.data as Array<{ id: string; name: string; phone?: string }>,
  });
  const updateItem = (index: number, update: Partial<typeof emptyItem>) =>
    setItems(previous => previous.map((line, position) => index === position ? { ...line, ...update } : line));

  const fetchQueue = useCallback(async () => {
    const generation = ++queueGeneration.current;
    try {
      setLoading(true);
      const res = await api.get('/prescriptions', {
        params: { status: statusFilter !== 'ALL' ? statusFilter : undefined },
      });
      if (queueGeneration.current === generation) setPrescriptions(res.data?.prescriptions || []);
    } catch (err) {
      console.error('Failed to fetch prescription queue', err);
      if (queueGeneration.current === generation) setError('Could not load prescriptions. Please retry.');
    } finally {
      if (queueGeneration.current === generation) setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchQueue();
    return () => { queueGeneration.current++; };
  }, [fetchQueue]);

  const handleClaim = async (rxId: string) => {
    try {
      await api.post(`/prescriptions/${rxId}/claim`);
      fetchQueue();
    } catch (err) {
      console.error('Failed to claim prescription', err);
      setError('Could not claim this prescription. Please retry.');
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const payload = new FormData();
      payload.append('doctor_name', uploadForm.doctor_name.trim());
      payload.append('doctor_registration_number', uploadForm.doctor_registration_number.trim());
      for (const field of ['doctor_address', 'written_date', 'patient_id', 'external_rx_number'] as const) {
        const value = uploadForm[field].trim();
        if (value) payload.append(field, value);
      }
      if (file) payload.append('file', file);
      payload.append('items_json', JSON.stringify(items.map(item => ({
        raw_text: item.name.trim(), prescribed_name: item.name.trim(), prescribed_quantity: Number(item.quantity),
        dose_text: item.dose.trim() || undefined, substitution_allowed: false,
      }))));
      await api.post('/prescriptions', payload, { 'axios-retry': { retries: 0 } });
      setShowUploadModal(false);
      setFile(null);
      setUploadForm(emptyForm);
      setItems([{ ...emptyItem }]);
      setPatientSearch('');
      fetchQueue();
    } catch (err) {
      console.error('Failed to upload prescription', err);
      setError('Could not save prescription. Check the file format and entered details, then retry.');
    } finally {
      setSaving(false);
    }
  };

  if (selectedRx) {
    return (
      <PrescriptionReviewWorkspace
        prescription={selectedRx}
        onBack={() => {
          setSelectedRx(null);
          fetchQueue();
        }}
      />
    );
  }

  return (
    <div className="p-6 space-y-6">
      {error && <div role="alert" className="glass-panel p-4"><p>{error}</p><Button variant="secondary" onClick={() => { setError(''); void fetchQueue(); }}>Retry loading</Button></div>}
      {showSetup && <DispensingSetupDialog onClose={() => setShowSetup(false)} />}
      <div className="flex flex-wrap gap-4 justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-muted tracking-tight flex items-center gap-2">
            <FileText className="w-7 h-7 text-primary" />
            Prescriptions
          </h1>
          <p className="text-muted text-sm mt-1">
            Review prescriptions and approve medicines for dispensing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {role === 'OWNER' && <Button variant="secondary" onClick={() => setShowSetup(true)}>Dispensing setup</Button>}
        <Button onClick={() => setShowUploadModal(true)} className="flex items-center gap-2 bg-primary hover:bg-primary text-on-primary">
          <FileText className="w-4 h-4" /> Upload New Prescription
        </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-4 flex flex-wrap gap-4 items-center justify-between border-border">
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="w-4 h-4 text-muted" />
          <span className="text-xs font-semibold text-muted">Status:</span>
          {['NEEDS_REVIEW', 'VERIFIED', 'PARTIALLY_DISPENSED', 'DISPENSED', 'REJECTED', 'ALL'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                statusFilter === st
                  ? 'bg-primary text-on-primary font-semibold'
                  : 'bg-surface-alt text-muted hover:bg-surface-alt'
              }`}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>
      </Card>

      {/* Queue Table */}
      <Card className="overflow-hidden border border-border shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-surface-alt border-b border-border text-muted font-semibold text-xs uppercase tracking-wider">
                <th className="p-3">Status</th>
                <th className="p-3">Rx Number</th>
                <th className="p-3">Doctor</th>
                <th className="p-3">Prescribed Date</th>
                <th className="p-3">Items</th>
                <th className="p-3">Assigned Pharmacist</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted text-sm">
                    Loading prescription queue...
                  </td>
                </tr>
              ) : prescriptions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted text-sm">
                    No prescriptions found matching selected status filter.
                  </td>
                </tr>
              ) : (
                prescriptions.map((rx) => (
                  <tr key={rx.id || rx._local_id} className="hover:bg-surface-alt transition">
                    <td className="p-3">
                      <Badge
                        variant={
                          rx.status === 'VERIFIED'
                            ? 'success'
                            : rx.status === 'REJECTED'
                            ? 'danger'
                            : rx.status === 'NEEDS_REVIEW'
                            ? 'warning'
                            : 'neutral'
                        }
                      >
                        {rx.status}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono font-bold text-muted">{rx.prescription_number}</td>
                    <td className="p-3">
                      <div className="font-semibold text-muted">{rx.doctor_name_snapshot}</div>
                      <div className="text-xs text-muted">Reg: {rx.doctor_registration_number_snapshot}</div>
                    </td>
                    <td className="p-3 text-xs text-muted">
                      {new Date(rx.prescribed_at).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-xs font-semibold text-muted">
                      {rx.items?.length || 0} lines
                    </td>
                    <td className="p-3 text-xs text-muted">
                      {rx.assigned_to ? (
                        <span className="flex items-center gap-1 text-primary font-medium">
                          <UserCheck className="w-3.5 h-3.5" /> Assigned
                        </span>
                      ) : (
                        <span className="text-muted">Unassigned</span>
                      )}
                    </td>
                    <td className="p-3 text-right space-x-2">
                      {!rx.assigned_to && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleClaim(rx.id || rx._local_id)}
                        >
                          Claim
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="bg-primary hover:bg-primary text-on-primary"
                        onClick={() => { void api.get(`/prescriptions/${rx.id || rx._local_id}`).then(result => setSelectedRx(result.data.data)).catch(() => setError('Could not open prescription. Please retry.')); }}
                      >
                        Review Workspace
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Upload Modal */}
      {showUploadModal && (
        <Modal isOpen={showUploadModal} onClose={() => setShowUploadModal(false)} title="Upload Prescription">
          <form onSubmit={handleUpload} className="space-y-4">
            {error && <p role="alert" className="text-danger text-sm">{error}</p>}
            <Input label="Prescription document (optional)" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={event => setFile(event.target.files?.[0] || null)} />
            <p className="text-xs text-muted">PDF or image, up to 10 MB. Enter the medication and quantity exactly as prescribed.</p>
            <div>
              <Input
                label="Doctor Name"
                required
                value={uploadForm.doctor_name}
                onChange={(e) => setUploadForm({ ...uploadForm, doctor_name: e.target.value })}
                placeholder="Dr. S. Kumar"
              />
            </div>
            <div>
              <Input
                label="Doctor Registration Number"
                required
                value={uploadForm.doctor_registration_number}
                onChange={(e) => setUploadForm({ ...uploadForm, doctor_registration_number: e.target.value })}
                placeholder="MCI-998822"
              />
            </div>
            <Input label="Prescriber address" required={!!file} value={uploadForm.doctor_address}
              onChange={event => setUploadForm({ ...uploadForm, doctor_address: event.target.value })} />
            <Input label="Date written on prescription" type="date" required={!!file} value={uploadForm.written_date}
              onChange={event => setUploadForm({ ...uploadForm, written_date: event.target.value })} />
            <Input label="Prescription number on document" value={uploadForm.external_rx_number}
              onChange={event => setUploadForm({ ...uploadForm, external_rx_number: event.target.value })} />
            <Input label="Find patient by name or phone" value={patientSearch}
              onChange={event => { setPatientSearch(event.target.value); setUploadForm({ ...uploadForm, patient_id: '' }); }} />
            <label className="block text-sm">Patient
              <select className="mt-1 block w-full rounded-lg border border-border bg-surface p-2" required={!!file}
                value={uploadForm.patient_id} onChange={event => setUploadForm({ ...uploadForm, patient_id: event.target.value })}>
                <option value="">Choose a saved patient</option>
                {patients.data?.map(patient => <option key={patient.id} value={patient.id}>{patient.name} · {patient.phone || 'No phone'}</option>)}
              </select>
            </label>
            <p className="text-xs text-muted">For regulated checkout the patient record must have the address written on the prescription.</p>
            {items.map((item, index) => <div className="space-y-2 rounded-lg border border-border p-3" key={index}>
              <Input label={`Prescribed medicine ${index + 1}`} required value={item.name}
                onChange={event => updateItem(index, { name: event.target.value })} />
              <Input label={`Quantity ${index + 1}`} type="number" required min="1" max="10000" step="1" value={item.quantity}
                onChange={event => updateItem(index, { quantity: event.target.value })} />
              <Input label={`Written dose ${index + 1}`} required={!!file} value={item.dose}
                onChange={event => updateItem(index, { dose: event.target.value })} />
              {items.length > 1 && <Button type="button" variant="ghost" onClick={() => setItems(previous => previous.filter((_item, position) => position !== index))}>Remove medicine</Button>}
            </div>)}
            <Button type="button" variant="secondary" disabled={items.length >= 100} onClick={() => setItems(previous => [...previous, { ...emptyItem }])}>Add prescribed medicine</Button>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="secondary" onClick={() => setShowUploadModal(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary text-on-primary">{saving ? 'Saving…' : 'Save & Add to Queue'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
