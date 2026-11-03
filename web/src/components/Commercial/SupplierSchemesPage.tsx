import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Truck, Plus } from 'lucide-react';

export const SupplierSchemesPage: React.FC = () => {
  const [schemes, setSchemes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    supplier_id: '',
    scheme_type: 'BUY_X_GET_Y_FREE',
    min_quantity: 10,
    free_quantity: 1,
    discount_pct: 0,
  });

  const fetchSchemes = async () => {
    try {
      setLoading(true);
      const res = await api.get('/commercial/supplier-schemes');
      setSchemes(res.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch supplier schemes', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchemes();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/commercial/supplier-schemes', {
        name: formData.name,
        supplier_id: formData.supplier_id || null,
        scheme_type: formData.scheme_type,
        min_quantity: Number(formData.min_quantity),
        free_quantity: Number(formData.free_quantity),
        discount_pct: Number(formData.discount_pct),
      });

      setShowModal(false);
      fetchSchemes();
    } catch (err) {
      console.error('Failed to create scheme', err);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground-strong tracking-tight flex items-center gap-2">
            <Truck className="w-7 h-7 text-info" />
            Supplier schemes
          </h1>
          <p className="text-muted text-sm mt-1">
            Configure Buy 10 Get 1 Free, Trade Discounts, and automatic blended effective acquisition unit costs.
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-info hover:bg-info text-on-primary">
          <Plus className="w-4 h-4" /> Add Supplier Scheme
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-3 text-center py-12 text-muted">Loading supplier schemes...</div>
        ) : schemes.length === 0 ? (
          <Card className="col-span-3 p-12 text-center text-muted">
            <Truck className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="font-semibold text-foreground">No active procurement schemes</p>
            <p className="text-sm text-muted mt-1">Configure supplier offers to automatically lower inventory cost basis.</p>
          </Card>
        ) : (
          schemes.map((s) => (
            <Card key={s.id || s._local_id} className="p-5 border border-border hover:shadow-lg transition">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-foreground-strong text-base">{s.name}</h3>
                  <p className="text-xs text-muted mt-0.5">{s.supplier_name || 'Universal All Suppliers'}</p>
                </div>
                <Badge variant={s.status === 'ACTIVE' ? 'success' : 'neutral'}>{s.status}</Badge>
              </div>

              <div className="mt-4 pt-3 border-t border-border space-y-1.5 text-xs text-foreground">
                <div className="flex justify-between">
                  <span>Scheme Type:</span>
                  <span className="font-semibold text-foreground-strong">{s.scheme_type}</span>
                </div>
                {s.scheme_type === 'BUY_X_GET_Y_FREE' && (
                  <div className="flex justify-between">
                    <span>Terms:</span>
                    <span className="font-semibold text-info">Buy {s.min_quantity} + Get {s.free_quantity} Free</span>
                  </div>
                )}
                {s.scheme_type === 'TRADE_DISCOUNT_PCT' && (
                  <div className="flex justify-between">
                    <span>Trade Discount:</span>
                    <span className="font-semibold text-success">{s.discount_pct}%</span>
                  </div>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      {showModal && (
        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Procurement Scheme">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Scheme Name</label>
              <Input
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Cipla Asthma Range 10+1 Free"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Scheme Type</label>
              <select
                className="w-full border border-border rounded-md p-2 text-sm bg-surface"
                value={formData.scheme_type}
                onChange={(e) => setFormData({ ...formData, scheme_type: e.target.value })}
              >
                <option value="BUY_X_GET_Y_FREE">Buy X Get Y Free Units</option>
                <option value="TRADE_DISCOUNT_PCT">Trade Discount Percentage</option>
                <option value="FLAT_DISCOUNT">Flat Inward Discount</option>
              </select>
            </div>

            {formData.scheme_type === 'BUY_X_GET_Y_FREE' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Min Billed Qty (X)</label>
                  <Input
                    type="number"
                    value={formData.min_quantity}
                    onChange={(e) => setFormData({ ...formData, min_quantity: parseInt(e.target.value) || 10 })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Free Quantity (Y)</label>
                  <Input
                    type="number"
                    value={formData.free_quantity}
                    onChange={(e) => setFormData({ ...formData, free_quantity: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
            )}

            {formData.scheme_type === 'TRADE_DISCOUNT_PCT' && (
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Trade Discount (%)</label>
                <Input
                  type="number"
                  value={formData.discount_pct}
                  onChange={(e) => setFormData({ ...formData, discount_pct: parseFloat(e.target.value) || 0 })}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" className="bg-info hover:bg-info text-on-primary">Save Supplier Scheme</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
