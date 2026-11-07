import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { counterError } from './CounterDialogs';

interface SisterStock {
  store_id: string;
  store_name: string;
  available_quantity: number;
  batches: Array<{ batch: string; expiry: string; quantity: number }>;
}

export function SisterStoresDialog({ medicine, onClose }: {
  medicine: { id: string; name: string }; onClose: () => void;
}) {
  const [source, setSource] = useState<SisterStock>();
  const [quantity, setQuantity] = useState('1');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const request = useRef({ signature: '', id: '' });
  const branches = useQuery({
    queryKey: ['sister-stock', medicine.id],
    queryFn: async () => (await api.get(`/branches/sister-stock/${medicine.id}`)).data as {
      data: SisterStock[]; can_request: boolean;
    },
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!source || pending) return;
    const count = Number(quantity);
    if (!Number.isInteger(count) || count <= 0 || count > source.available_quantity) return;
    const signature = `${source.store_id}:${count}`;
    if (request.current.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    setError('');
    setPending(true);
    try {
      const response = await api.post(`/branches/sister-stock/${medicine.id}/request`, {
        source_store_id: source.store_id, quantity: count, request_id: request.current.id,
      });
      setMessage(`Transfer ${response.data.data.transfer_number} requested. Stock becomes available after receipt.`);
      setSource(undefined);
    } catch (failure) {
      setError(counterError(failure, 'Unable to request stock.'));
    } finally {
      setPending(false);
    }
  }

  return <Modal isOpen onClose={onClose} title={`Sister stores · ${medicine.name}`}>
    {branches.isPending && <p>Checking available stock…</p>}
    {branches.isError && <p role="alert" className="text-danger">Unable to check sister stores.</p>}
    {branches.data?.data.length === 0 && <p>No available stock at the other branches you can access.</p>}
    <ul className="space-y-2">
      {branches.data?.data.map(branch => <li key={branch.store_id} className="rounded-lg border border-border p-3">
        <p><strong>{branch.store_name}</strong> · {branch.available_quantity} available</p>
        {branch.batches.map(batch => <p key={batch.batch} className="text-xs text-muted">
          Batch {batch.batch} · Expiry {batch.expiry} · {batch.quantity} units
        </p>)}
        {branches.data.can_request && <Button className="mt-2" variant="secondary" type="button" onClick={() => {
          setSource(branch); setQuantity('1'); setMessage(''); setError('');
        }}>Request from {branch.store_name}</Button>}
      </li>)}
    </ul>
    {source && <form onSubmit={submit} className="mt-3 space-y-2">
      <label className="block text-sm">Quantity from {source.store_name}
        <input className="ml-2 w-24 rounded border border-border bg-surface p-1" type="number"
          min="1" max={source.available_quantity} step="1" required value={quantity} onChange={event => setQuantity(event.target.value)} />
      </label>
      <Button type="submit" disabled={pending}>Send transfer request</Button>
    </form>}
    {message && <p role="status" className="mt-3 text-sm text-success">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
  </Modal>;
}
