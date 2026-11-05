import { useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import api from '../../lib/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface DeleteMedicineModalProps {
    medicine: { id: string; name: string };
    onClose: () => void;
    onSuccess: () => void;
}

const steps = ['Review medicine', 'Acknowledge impact', 'Confirm deletion'];

/** Mounted for one selection so cancelling or switching medicines resets every confirmation. */
export function DeleteMedicineModal({ medicine, onClose, onSuccess }: DeleteMedicineModalProps) {
    const [step, setStep] = useState(0);
    const [acknowledged, setAcknowledged] = useState(false);
    const [confirmation, setConfirmation] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inFlight = useRef(false);

    const handleClose = () => {
        if (!inFlight.current) onClose();
    };

    const handleDelete = async () => {
        if (step !== 2 || !acknowledged || confirmation !== medicine.name || inFlight.current) return;
        inFlight.current = true;
        setSubmitting(true);
        setError(null);
        try {
            await api.delete(`/inventory/medicines/${encodeURIComponent(medicine.id)}`);
        } catch (err: unknown) {
            const failure = err as { response?: { data?: { error?: string | { message?: string } } } };
            const apiError = failure.response?.data?.error;
            setError((typeof apiError === 'string' ? apiError : apiError?.message) || 'Could not delete the medicine. Please try again.');
            return;
        } finally {
            inFlight.current = false;
            setSubmitting(false);
        }
        onSuccess();
        onClose();
    };

    return (
        <Modal
            isOpen
            onClose={handleClose}
            title="Delete medicine"
            footer={
                <>
                    <Button variant="ghost" onClick={handleClose} disabled={submitting}>Cancel</Button>
                    {step > 0 && (
                        <Button variant="secondary" disabled={submitting} onClick={() => {
                            setStep(step - 1);
                            setAcknowledged(false);
                            setConfirmation('');
                            setError(null);
                        }}>Back</Button>
                    )}
                    {step < 2 ? (
                        <Button disabled={step === 1 && !acknowledged} onClick={() => setStep(step + 1)}>
                            Continue
                        </Button>
                    ) : (
                        <Button variant="danger" onClick={() => void handleDelete()} isLoading={submitting}
                            disabled={!acknowledged || confirmation !== medicine.name}>
                            Delete medicine
                        </Button>
                    )}
                </>
            }
        >
            <div className="space-y-5">
                <ol aria-label="Deletion steps" className="grid grid-cols-3 gap-2">
                    {steps.map((label, index) => (
                        <li key={label} aria-current={step === index ? 'step' : undefined}
                            className={`border-t-4 pt-2 text-xs ${index <= step ? 'border-danger text-foreground font-semibold' : 'border-border text-muted'}`}>
                            {index + 1}. {label}
                        </li>
                    ))}
                </ol>
                <h3 aria-live="polite" className="font-semibold text-foreground-strong">
                    Step {step + 1} of 3: {steps[step]}
                </h3>
                <dl className="rounded-lg border border-border bg-surface-elevated p-4 space-y-2 text-sm">
                    <div><dt className="text-xs text-muted">Medicine</dt><dd className="font-semibold break-words">{medicine.name}</dd></div>
                    <div><dt className="text-xs text-muted">Master SKU</dt><dd className="font-mono text-xs break-all">{medicine.id}</dd></div>
                </dl>
                {step === 0 && (
                    <p className="text-sm text-muted">
                        Review the medicine above. Deleting it removes the entire medicine from active inventory, including all its batches.
                    </p>
                )}
                {step === 1 && (
                    <>
                        <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm space-y-2">
                            <p className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle size={18} aria-hidden />This affects the whole medicine</p>
                            <p>It will no longer appear in active inventory or be available for new billing. Existing sales, purchases and batch history will be retained.</p>
                            <p>There is no undo option here.</p>
                        </div>
                        <label className="flex items-start gap-3 text-sm cursor-pointer">
                            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-danger" checked={acknowledged}
                                onChange={event => setAcknowledged(event.target.checked)} />
                            <span>I understand that this removes the medicine and all its batches from active inventory.</span>
                        </label>
                    </>
                )}
                {step === 2 && (
                    <>
                        <p id="delete-medicine-help" className="text-sm text-muted">
                            Type <strong className="text-foreground select-text break-words">{medicine.name}</strong> exactly to confirm deletion.
                        </p>
                        <Input label="Medicine name to confirm" value={confirmation} autoFocus autoComplete="off" spellCheck={false}
                            disabled={submitting} aria-describedby="delete-medicine-help"
                            onChange={event => setConfirmation(event.target.value)} />
                    </>
                )}
                {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
            </div>
        </Modal>
    );
}
