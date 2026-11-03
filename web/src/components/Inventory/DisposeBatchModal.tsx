import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import api from '../../lib/api';
import type { RadarItem } from '../../services/inventoryRadarCore';
import { INVENTORY_PAGE_COPY } from '../../config/appContent';

export type DisposalReason = 'EXPIRED' | 'DAMAGED' | 'RECALL' | 'OTHER';

interface DisposeBatchModalProps {
    batch: RadarItem | null;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const DisposeBatchModal: React.FC<DisposeBatchModalProps> = ({ batch, isOpen, onClose, onSuccess }) => {
    const [reason, setReason] = useState<DisposalReason>('EXPIRED');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleClose = () => {
        if (submitting) return;
        setError(null);
        setNotes('');
        setReason('EXPIRED');
        onClose();
    };

    const handleConfirm = async () => {
        if (!batch) return;
        setSubmitting(true);
        setError(null);
        try {
            await api.post(`/inventory/batches/${batch.id}/dispose`, {
                reason,
                notes: notes.trim() || undefined,
            });
            onSuccess();
            handleClose();
        } catch (err: any) {
            const apiErr = err.response?.data?.error;
            setError(
                (typeof apiErr === 'object' && apiErr?.message) ||
                    (typeof apiErr === 'string' ? apiErr : null) ||
                    err.message ||
                    'Disposal failed',
            );
        } finally {
            setSubmitting(false);
        }
    };

    if (!batch) return null;

    const copy = INVENTORY_PAGE_COPY.disposeModal;

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={copy.title}
            footer={
                <>
                    <Button variant="ghost" onClick={handleClose} disabled={submitting}>
                        {copy.cancel}
                    </Button>
                    <Button variant="danger" onClick={handleConfirm} disabled={submitting}>
                        {copy.confirm}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <dt className="text-muted font-bold uppercase text-xs tracking-wider">Medicine</dt>
                        <dd className="font-bold text-foreground-strong">{batch.name}</dd>
                    </div>
                    <div>
                        <dt className="text-muted font-bold uppercase text-xs tracking-wider">Batch ID</dt>
                        <dd className="font-mono">{batch.batch}</dd>
                    </div>
                    <div>
                        <dt className="text-muted font-bold uppercase text-xs tracking-wider">Expiry</dt>
                        <dd className="font-black tabular-nums">{batch.expiry}</dd>
                    </div>
                    <div>
                        <dt className="text-muted font-bold uppercase text-xs tracking-wider">On hand</dt>
                        <dd className="font-black tabular-nums">{batch.qty}</dd>
                    </div>
                </dl>

                <div>
                    <label className="text-label font-bold text-muted uppercase text-xs tracking-wider block mb-2">
                        {copy.reasonLabel}
                    </label>
                    <select
                        className="w-full rounded-lg border-2 border-border bg-surface px-4 py-3 font-bold text-foreground"
                        value={reason}
                        onChange={(e) => setReason(e.target.value as DisposalReason)}
                    >
                        {copy.reasons.map((r) => (
                            <option key={r.value} value={r.value}>
                                {r.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="text-label font-bold text-muted uppercase text-xs tracking-wider block mb-2">
                        {copy.notesLabel}
                    </label>
                    <textarea
                        className="w-full rounded-lg border-2 border-border bg-surface px-4 py-3 font-medium text-foreground min-h-[80px]"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        maxLength={2000}
                    />
                </div>

                {error && (
                    <p className="text-sm text-danger font-bold bg-danger/10 border border-danger/30 rounded-lg px-4 py-3">{error}</p>
                )}
            </div>
        </Modal>
    );
};
