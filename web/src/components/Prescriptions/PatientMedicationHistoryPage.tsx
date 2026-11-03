import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { useParams } from 'react-router-dom';
import { LoadError } from '../ui/ListFeedback';
import toast from 'react-hot-toast';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { HeartPulse, ShieldAlert, History, Pill, Plus } from 'lucide-react';

interface MedicationHistory {
  patientName?: string;
  allergies: Array<{id?: string; _local_id?: string; allergen: string; severity: string}>;
  activeMedications: Array<{medicineId: string; medicineName: string; lastDispensedAt: string; sourceLabel: string}>;
  dispensingTimeline: unknown[];
}

export const PatientMedicationHistoryPage: React.FC<{ patientId?: string }> = ({ patientId: suppliedPatientId }) => {
  const params = useParams<{ id: string }>();
  const patientId = suppliedPatientId || params.id;
  const [loadError, setLoadError] = useState(false);
  const [allergyError, setAllergyError] = useState('');
  const [savingAllergy, setSavingAllergy] = useState(false);
  const [history, setHistory] = useState<MedicationHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllergyModal, setShowAllergyModal] = useState(false);
  const [allergyForm, setAllergyForm] = useState({
    allergen: '',
    allergen_type: 'INGREDIENT',
    severity: 'MODERATE',
    reaction_text: '',
  });

  const fetchHistory = useCallback(async (signal?: AbortSignal) => {
    if (!patientId) { setLoading(false); setLoadError(true); return; }
    try {
      setLoading(true);
      setLoadError(false);
      const res = await api.get(`/patients/${patientId}/medication-history`, { signal });
      if (!signal?.aborted) setHistory(res.data?.data || null);
    } catch (err) {
      if (!signal?.aborted) { setLoadError(true); setHistory(null); }
      if (!signal?.aborted) console.error('Failed to fetch patient medication history', err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchHistory(controller.signal);
    return () => controller.abort();
  }, [fetchHistory]);

  const handleAddAllergy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId || savingAllergy) return;
    setSavingAllergy(true);
    setAllergyError('');
    try {
      await api.post(`/patients/${patientId}/allergies`, allergyForm);
      setShowAllergyModal(false);
      setAllergyForm({ allergen: '', allergen_type: 'INGREDIENT', severity: 'MODERATE', reaction_text: '' });
      toast.success('Allergy recorded');
      await fetchHistory();
    } catch (err) {
      console.error('Failed to record allergy', err);
      setAllergyError('Could not save this allergy. Check the details and try again.');
    } finally { setSavingAllergy(false); }
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted">Loading patient medication history...</div>;
  }

  if (loadError) return <div className="p-6 space-y-5"><h1>Medication history</h1><LoadError onRetry={() => void fetchHistory()} /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-muted tracking-tight flex items-center gap-2">
            <HeartPulse className="w-7 h-7 text-danger" />
            Medication history
          </h1>
          <p className="text-muted text-sm mt-1">
            Patient: <span className="font-semibold text-muted">{history?.patientName}</span> | Complete dispensing timeline and allergy alerts.
          </p>
        </div>
        <Button onClick={() => { setAllergyError(''); setShowAllergyModal(true); }} className="flex items-center gap-2 bg-danger hover:bg-danger text-on-primary">
          <Plus className="w-4 h-4" /> Record Patient Allergy
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 border-l-4 border-danger/25">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs text-muted uppercase font-semibold">Recorded Allergies</span>
              <div className="text-2xl font-bold text-muted mt-1">{history?.allergies?.length || 0}</div>
            </div>
            <ShieldAlert className="w-6 h-6 text-danger" />
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-primary/25">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs text-muted uppercase font-semibold">Active Medications (60 Days)</span>
              <div className="text-2xl font-bold text-muted mt-1">{history?.activeMedications?.length || 0}</div>
            </div>
            <Pill className="w-6 h-6 text-primary" />
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-success/25">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs text-muted uppercase font-semibold">Total Dispensing Events</span>
              <div className="text-2xl font-bold text-muted mt-1">{history?.dispensingTimeline?.length || 0}</div>
            </div>
            <History className="w-6 h-6 text-success" />
          </div>
        </Card>
      </div>

      {/* Allergies Banner */}
      {(history?.allergies.length ?? 0) > 0 && (
        <Card className="p-4 bg-danger/8 border border-danger/25 space-y-2">
          <h3 className="font-bold text-danger text-sm flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-danger" /> Active Recorded Patient Allergies
          </h3>
          <div className="flex flex-wrap gap-2">
            {history?.allergies.map((alg) => (
              <span key={alg.id || alg._local_id} className="bg-danger/8 text-danger text-xs px-2.5 py-1 rounded-md font-semibold border border-danger/25">
                {alg.allergen} ({alg.severity})
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Active Medications List */}
      <Card className="p-5 space-y-4">
        <h3 className="font-bold text-muted text-base flex items-center gap-2">
          <Pill className="w-5 h-5 text-primary" /> Active Medications
        </h3>
        {history?.activeMedications?.length === 0 ? (
          <p className="text-xs text-muted">No active recorded medications in recent 60 days.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {history?.activeMedications.map((med) => (
              <div key={med.medicineId} className="p-3 bg-surface-alt border border-border rounded-lg text-xs space-y-1">
                <div className="font-bold text-muted text-sm">{med.medicineName}</div>
                <div className="text-muted">Last Dispensed: {new Date(med.lastDispensedAt).toLocaleDateString()}</div>
                <div className="text-muted italic font-mono">{med.sourceLabel}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add Allergy Modal */}
      {showAllergyModal && (
        <Modal isOpen={showAllergyModal} onClose={() => { if (!savingAllergy) setShowAllergyModal(false); }} title="Record Patient Allergy">
          <form onSubmit={handleAddAllergy} className="space-y-4">
            {allergyError && <p role="alert" className="text-sm text-danger">{allergyError}</p>}
            <div>

              <Input
                label="Allergen (substance or ingredient)"
                required
                value={allergyForm.allergen}
                onChange={(e) => setAllergyForm({ ...allergyForm, allergen: e.target.value })}
                placeholder="e.g. Sulfa, Penicillin, Paracetamol"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="allergy-type" className="block text-xs font-semibold text-muted mb-1">Allergen type</label>
                <select
                  className="w-full border border-border rounded p-2 text-sm bg-surface"
                  id="allergy-type" value={allergyForm.allergen_type}
                  onChange={(e) => setAllergyForm({ ...allergyForm, allergen_type: e.target.value })}
                >
                  <option value="INGREDIENT">Active Ingredient</option>
                  <option value="DRUG_CLASS">Drug Class</option>
                  <option value="FOOD">Food / Excipient</option>
                </select>
              </div>
              <div>
                <label htmlFor="allergy-severity" className="block text-xs font-semibold text-muted mb-1">Severity</label>
                <select
                  className="w-full border border-border rounded p-2 text-sm bg-surface"
                  id="allergy-severity" value={allergyForm.severity}
                  onChange={(e) => setAllergyForm({ ...allergyForm, severity: e.target.value })}
                >
                  <option value="MILD">Mild</option>
                  <option value="MODERATE">Moderate</option>
                  <option value="SEVERE">Severe</option>
                  <option value="ANAPHYLAXIS">Anaphylaxis</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="secondary" disabled={savingAllergy} onClick={() => setShowAllergyModal(false)}>Cancel</Button>
              <Button type="submit" isLoading={savingAllergy} className="bg-danger hover:bg-danger text-on-primary">Save Allergy</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
