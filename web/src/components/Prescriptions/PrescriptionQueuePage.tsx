import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../lib/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { FileText, UserCheck, Filter } from 'lucide-react';
import { PrescriptionReviewWorkspace } from './PrescriptionReviewWorkspace';

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
  const [uploadForm, setUploadForm] = useState({
    doctor_name: '',
    doctor_registration_number: '',
    raw_text: '',
    quantity: '',
  });

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
      if (file) payload.append('file', file);
      payload.append('items_json', JSON.stringify([{ raw_text: uploadForm.raw_text.trim(), prescribed_name: uploadForm.raw_text.trim(), prescribed_quantity: Number(uploadForm.quantity), substitution_allowed: false }]));
      await api.post('/prescriptions', payload, { 'axios-retry': { retries: 0 } });
      setShowUploadModal(false);
      setFile(null);
      setUploadForm({ doctor_name: '', doctor_registration_number: '', raw_text: '', quantity: '' });
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
        <Button onClick={() => setShowUploadModal(true)} className="flex items-center gap-2 bg-primary hover:bg-primary text-on-primary">
          <FileText className="w-4 h-4" /> Upload New Prescription
        </Button>
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
            <div>
              <Input
                label="Prescribed Medication Raw Line"
                required
                value={uploadForm.raw_text}
                onChange={(e) => setUploadForm({ ...uploadForm, raw_text: e.target.value })}
              />
            </div>
            <Input label="Prescribed quantity" type="number" required min="1" max="10000" step="1" value={uploadForm.quantity} onChange={event => setUploadForm({ ...uploadForm, quantity: event.target.value })} />
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
