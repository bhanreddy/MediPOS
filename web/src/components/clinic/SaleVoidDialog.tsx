import { useRef, useState } from 'react';
import api from '../../lib/api';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { printReturnDocument } from './SaleReturnDialog';
import { counterError } from './CounterDialogs';

export function SaleVoidDialog({ invoice, onClose, onComplete }: {
  invoice: { id: string; invoice_number: string };
  onClose: () => void;
  onComplete: () => void;
}) {
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(false);
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reversal, setReversal] = useState<{ id: string; invoice_number: string }>();
  const request = useRef({ signature: '', id: '' });

  async function voidInvoice(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !reason.trim()) return;
    const input = { reason: reason.trim(), restock, refund_reference: reference.trim() || undefined, register_required: true };
    const signature = JSON.stringify(input);
    if (request.current.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    setBusy(true);
    setError('');
    try {
      const response = await api.post(`/sales/${invoice.id}/void`, { ...input, _local_id: request.current.id });
      setReversal(response.data.data);
      onComplete();
    } catch (failure) {
      setError(counterError(failure, 'Unable to void this invoice. Retry to keep the same request.'));
    } finally {
      setBusy(false);
    }
  }

  return <Modal isOpen onClose={() => { if (!busy) onClose(); }} title={`Void invoice · ${invoice.invoice_number}`}>
    {reversal ? <div className="space-y-3">
      <p>Invoice voided. Reversal <strong>{reversal.invoice_number}</strong> records the refund.</p>
      <Button onClick={() => void printReturnDocument(reversal.id).catch(failure => setError(failure.message))}>Print reversal</Button>
    </div> : <form onSubmit={voidInvoice} className="space-y-3">
      <p className="text-sm text-muted">This reverses the full bill using its original payment methods. The original invoice stays in sales history.</p>
      <label className="block text-sm">Cancellation reason
        <textarea required maxLength={400} value={reason} onChange={event => setReason(event.target.value)}
          className="mt-1 block w-full rounded-lg border border-border bg-surface p-2" />
      </label>
      <label className="block text-sm">Refund reference
        <input maxLength={255} value={reference} onChange={event => setReference(event.target.value)}
          className="mt-1 block w-full rounded-lg border border-border bg-surface p-2" />
      </label>
      <label className="flex gap-2 text-sm">
        <input type="checkbox" checked={restock} onChange={event => setRestock(event.target.checked)} />
        Restore stock after checking that the original batches can be resold
      </label>
      <Button type="submit" variant="danger" disabled={busy || !reason.trim()}>Approve and void invoice</Button>
    </form>}
    {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
  </Modal>;
}
