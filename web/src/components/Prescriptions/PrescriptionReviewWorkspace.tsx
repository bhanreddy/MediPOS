import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { ArrowLeft, CheckCircle, XCircle, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

function ProductMatch({ line, onMatch, value }: { line: number; onMatch: (id: string) => void; value?: string }) {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    if (query.trim().length < 2) return;
    const timer = setTimeout(() => {
      void api.get('/inventory/medicines/search', { params: { q: query.trim(), limit: 10, include_substitutes: false }, signal: controller.signal }).then(result => {
        if (!controller.signal.aborted) { setProducts(result.data.results || []); setError(''); }
      }).catch(() => { if (!controller.signal.aborted) setError('Could not search medicines. Please retry.'); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  return <div className="space-y-2">
    <Input label={`Match medicine for line ${line}`} value={query} placeholder="Search the inventory by name…" onChange={event => { setQuery(event.target.value); setProducts([]); setError(''); }} />
    {error && <p role="alert">{error}</p>}
    {products.map(product => <Button key={product.id} size="sm" variant="secondary" onClick={() => { onMatch(product.id); setQuery(''); setProducts([]); }}>{product.name}</Button>)}
    {value && <p className="text-xs text-success">Inventory medicine linked</p>}
  </div>;
}

export const PrescriptionReviewWorkspace: React.FC<{
  prescription: any;
  onBack: () => void;
}> = ({ prescription, onBack }) => {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [items, setItems] = useState<any[]>(prescription.items || []);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('UNREADABLE');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [document, setDocument] = useState<{ url: string; pdf: boolean } | null>(null);
  const [documentError, setDocumentError] = useState('');
  useEffect(() => {
    if (!prescription.document_url) return;
    let active = true;
    let objectUrl: string | undefined;
    void api.get('/prescriptions/document/signed-proxy', { params: { key: prescription.document_url }, responseType: 'blob' }).then(result => {
      if (!active) return;
      objectUrl = URL.createObjectURL(result.data);
      setDocument({ url: objectUrl, pdf: result.data.type === 'application/pdf' });
    }).catch(() => { if (active) setDocumentError('The original document could not be loaded.'); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [prescription.document_url]);

  const handleVerify = async () => {
    try {
      await api.post(`/prescriptions/${prescription.id || prescription._local_id}/verify`, {
        notes,
        item_updates: items.map((it) => ({
          itemId: it.id || it._local_id,
          matchedProductId: it.matched_product_id,
          prescribedQuantity: it.prescribed_quantity,
          substitutionAllowed: Boolean(it.substitution_allowed),
        })),
      });
      onBack();
    } catch (err) {
      console.error('Failed to verify prescription', err);
      setError('Verification failed. Check the prescription details and retry.');
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/prescriptions/${prescription.id || prescription._local_id}/reject`, {
        rejection_reason: rejectionReason,
        notes,
      });
      setShowRejectModal(false);
      onBack();
    } catch (err) {
      console.error('Failed to reject prescription', err);
      setError('Could not reject prescription. Please retry.');
    }
  };

  return (
    <div className="min-h-[70vh] flex flex-col bg-surface-alt rounded-2xl overflow-hidden">
      {error && <p role="alert" className="p-4 text-danger">{error}</p>}
      {/* Top Header Bar */}
      <div className="bg-surface border-b border-border px-4 py-3 flex flex-wrap gap-3 items-center justify-between shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" onClick={onBack} className="flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back to Queue
          </Button>
          <div className="h-4 w-px bg-surface-alt" />
          <h2 className="font-bold text-muted text-lg">
            Rx #{prescription.prescription_number}
          </h2>
          <Badge variant={prescription.verification_status === 'VERIFIED' ? 'success' : 'warning'}>
            {prescription.verification_status}
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="danger" size="sm" onClick={() => setShowRejectModal(true)} className="flex items-center gap-1">
            <XCircle className="w-4 h-4" /> Reject Prescription
          </Button>
          <Button
            size="sm"
            onClick={handleVerify}
            className="bg-success hover:bg-success text-on-primary flex items-center gap-1 font-semibold"
          >
            <CheckCircle className="w-4 h-4" /> Approve & Verify
          </Button>
        </div>
      </div>

      {/* Main Split Screen Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Side (~45%): Document Viewer */}
        <div className="w-full lg:w-[45%] min-w-0 bg-surface border-r border-border flex flex-col">
          {/* Controls toolbar */}
          <div className="bg-surface-elevated p-2 flex items-center justify-center gap-4 text-foreground text-xs">
            <button onClick={() => setZoom((z) => Math.max(50, z - 25))} className="p-1 hover:text-foreground-strong flex items-center gap-1">
              <ZoomOut className="w-4 h-4" /> Zoom Out
            </button>
            <span className="font-mono">{zoom}%</span>
            <button onClick={() => setZoom((z) => Math.min(200, z + 25))} className="p-1 hover:text-foreground-strong flex items-center gap-1">
              <ZoomIn className="w-4 h-4" /> Zoom In
            </button>
            <button onClick={() => setRotation((r) => (r + 90) % 360)} className="p-1 hover:text-foreground-strong flex items-center gap-1">
              <RotateCw className="w-4 h-4" /> Rotate
            </button>
          </div>

          {/* Document Preview Canvas */}
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[300px]">
            {document ? (document.pdf ? <iframe title="Original prescription document" src={document.url} className="w-full h-[500px] bg-surface" /> : <img alt="Original prescription document" src={document.url} style={{ transform: `scale(${zoom / 100}) rotate(${rotation}deg)` }} className="max-w-full" />) : <div
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transition: 'transform 0.2s ease',
              }}
              className="bg-surface p-4 rounded shadow-2xl w-full max-w-full text-muted text-sm font-serif"
            >
              <div className="border-b-2 border-border pb-3 mb-4 flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-base text-muted">{prescription.doctor_name_snapshot}</h3>
                  <p className="text-xs text-muted">Reg: {prescription.doctor_registration_number_snapshot}</p>
                </div>
                <div className="text-right text-xs text-muted">
                  Date: {new Date(prescription.prescribed_at).toLocaleDateString()}
                </div>
              </div>

              <div className="space-y-4 my-6">
                <div className="font-mono text-xl font-bold text-primary">Rx</div>
                {items.map((it, idx) => (
                  <div key={idx} className="p-2 bg-surface-alt rounded border border-border font-sans">
                    <div className="font-bold text-muted">{it.raw_text || it.prescribed_name}</div>
                    <div className="text-xs text-muted mt-1">Qty: {it.prescribed_quantity} | Dose: {it.dose_text || 'Not entered'}</div>
                  </div>
                ))}
              </div>

              <div className="pt-8 border-t border-border flex justify-between text-xs text-muted">
                <span>{documentError || 'Manual transcription'}</span>
                <span>Check against the original prescription</span>
              </div>
            </div>}
          </div>
        </div>

        {/* Right Side (~55%): Structured Verification Lines & Safety Controls */}
        <div className="w-full lg:w-[55%] min-w-0 bg-surface flex flex-col p-4 lg:p-6 overflow-y-auto space-y-6">
          <Card className="p-4 border-l-4 border-primary/25">
            <h3 className="font-bold text-foreground-strong text-sm">Doctor & Patient Metadata Snapshot</h3>
            <div className="grid grid-cols-2 gap-4 mt-2 text-xs text-foreground">
              <div>
                <span className="text-muted">Doctor Name:</span>
                <span className="font-semibold text-foreground-strong ml-1">{prescription.doctor_name_snapshot}</span>
              </div>
              <div>
                <span className="text-muted">Registration Number:</span>
                <span className="font-semibold text-foreground-strong ml-1">{prescription.doctor_registration_number_snapshot}</span>
              </div>
            </div>
          </Card>

          {/* Line Item Review Cards */}
          <div className="space-y-4">
            <h3 className="font-bold text-foreground-strong text-sm uppercase tracking-wider">
              Prescription Line Verification & Product Matching ({items.length} lines)
            </h3>

            {items.map((it, idx) => (
              <Card key={it.id || idx} className="p-4 border border-border space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs font-mono bg-surface-elevated text-foreground px-1.5 py-0.5 rounded font-semibold">
                      Line #{idx + 1}
                    </span>
                    <div className="font-bold text-foreground-strong text-base mt-1">{it.raw_text}</div>
                  </div>
                  <Badge variant={it.matched_product_id ? 'success' : 'warning'}>
                    {it.matched_product_id ? 'Matched' : 'Unmatched'}
                  </Badge>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border text-xs">
                  <div>
                    <label className="block font-semibold text-foreground mb-1">Prescribed Quantity</label>
                    <Input
                      label={`Prescribed quantity for line ${idx + 1}`}
                      type="number"
                      min="1" step="1"
                      value={it.prescribed_quantity}
                      onChange={(e) => {
                        const newQty = parseInt(e.target.value) || 1;
                        const copy = [...items];
                        copy[idx] = { ...copy[idx], prescribed_quantity: newQty };
                        setItems(copy);
                      }}
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-foreground mb-1">Generic Substitution</label>
                    <select
                      className="w-full border border-border rounded p-1.5 bg-surface text-xs"
                      value={it.substitution_allowed ? 'ALLOWED' : 'PROHIBITED'}
                      onChange={(e) => {
                        const copy = [...items];
                        copy[idx] = { ...copy[idx], substitution_allowed: e.target.value === 'ALLOWED' };
                        setItems(copy);
                      }}
                    >
                      <option value="ALLOWED">Allowed (Pharmacist Discretion)</option>
                      <option value="PROHIBITED">Prohibited by Doctor</option>
                    </select>
                  </div>
                </div>
                <ProductMatch line={idx + 1} value={it.matched_product_id} onMatch={id => setItems(current => current.map((item, index) => index === idx ? { ...item, matched_product_id: id } : item))} />
              </Card>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Pharmacist Verification Notes</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add verification notes or instructions for cashier..."
            />
          </div>
        </div>
      </div>

      {/* Rejection Reason Modal */}
      {showRejectModal && (
        <Modal isOpen={showRejectModal} onClose={() => setShowRejectModal(false)} title="Reject Prescription">
          <form onSubmit={handleRejectSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Select Rejection Reason</label>
              <select
                className="w-full border border-border rounded p-2 text-sm bg-surface"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              >
                <option value="UNREADABLE">Unreadable / Blurry Image</option>
                <option value="EXPIRED">Prescription Expired</option>
                <option value="INVALID">Invalid / Missing Signature</option>
                <option value="MISSING_DOCTOR_DETAILS">Missing Doctor Details</option>
                <option value="MEDICINE_UNCLEAR">Medicine Name Unclear</option>
                <option value="DUPLICATE_SUSPECTED">Duplicate Prescription Suspected</option>
                <option value="OTHER">Other Reason</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Rejection Details / Notes</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detailed reason for pharmacist rejection..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="secondary" onClick={() => setShowRejectModal(false)}>Cancel</Button>
              <Button type="submit" variant="danger">Confirm Rejection</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
