import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Ticket, Plus } from 'lucide-react';

export const CouponsPage: React.FC = () => {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    discount_type: 'PERCENTAGE',
    discount_value: 10,
    min_cart_value: 500,
    max_discount_amount: 200,
    usage_limit: 100,
    per_customer_limit: 1,
  });

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      const res = await api.get('/commercial/coupons');
      setCoupons(res.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch coupons', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/commercial/coupons', {
        code: formData.code.toUpperCase(),
        discount_type: formData.discount_type,
        discount_value: Number(formData.discount_value),
        min_cart_value_paise: Number(formData.min_cart_value) * 100,
        max_discount_paise: Number(formData.max_discount_amount) * 100,
        usage_limit: Number(formData.usage_limit),
        per_customer_limit: Number(formData.per_customer_limit),
      });

      setShowModal(false);
      fetchCoupons();
    } catch (err) {
      console.error('Failed to create coupon', err);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground-strong tracking-tight flex items-center gap-2">
            <Ticket className="w-7 h-7 text-warning" />
            Coupons
          </h1>
          <p className="text-muted text-sm mt-1">
            Manage campaign voucher codes with cart thresholds, per-customer limits, and checkout redemptions.
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-warning hover:bg-warning text-on-primary">
          <Plus className="w-4 h-4" /> Create Coupon
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-3 text-center py-12 text-muted">Loading coupons...</div>
        ) : coupons.length === 0 ? (
          <Card className="col-span-3 p-12 text-center text-muted">
            <Ticket className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="font-semibold text-foreground">No active coupon codes</p>
            <p className="text-sm text-muted mt-1">Create promotional coupons for customer checkout discounts.</p>
          </Card>
        ) : (
          coupons.map((c) => (
            <Card key={c.id || c._local_id} className="p-5 border border-border hover:shadow-lg transition">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-mono text-base font-bold bg-warning/8 text-warning border border-warning/25 px-3 py-1 rounded-md">
                    {c.code}
                  </span>
                  <div className="text-sm font-semibold text-foreground-strong mt-3">
                    {c.discount_type === 'PERCENTAGE' ? `${c.discount_value}% OFF` : `₹${c.discount_value} FLAT OFF`}
                  </div>
                </div>
                <Badge variant={c.status === 'ACTIVE' ? 'success' : 'neutral'}>{c.status}</Badge>
              </div>

              <div className="mt-4 pt-3 border-t border-border space-y-1.5 text-xs text-foreground">
                <div className="flex justify-between">
                  <span>Min Cart Value:</span>
                  <span className="font-semibold text-foreground-strong">₹{(c.min_cart_value_paise || 0) / 100}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Cap:</span>
                  <span className="font-semibold text-foreground-strong">₹{(c.max_discount_paise || 0) / 100}</span>
                </div>
                <div className="flex justify-between">
                  <span>Redeemed / Limit:</span>
                  <span className="font-semibold text-warning">{c.current_uses || 0} / {c.usage_limit || '∞'}</span>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {showModal && (
        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Create Promotional Coupon">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Coupon Code</label>
              <Input
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="e.g. HEALTH50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Discount Type</label>
                <select
                  className="w-full border border-border rounded-md p-2 text-sm bg-surface"
                  value={formData.discount_type}
                  onChange={(e) => setFormData({ ...formData, discount_type: e.target.value })}
                >
                  <option value="PERCENTAGE">Percentage (%)</option>
                  <option value="FLAT">Flat Amount (₹)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Discount Value</label>
                <Input
                  type="number"
                  value={formData.discount_value}
                  onChange={(e) => setFormData({ ...formData, discount_value: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Min Cart Value (₹)</label>
                <Input
                  type="number"
                  value={formData.min_cart_value}
                  onChange={(e) => setFormData({ ...formData, min_cart_value: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Max Cap (₹)</label>
                <Input
                  type="number"
                  value={formData.max_discount_amount}
                  onChange={(e) => setFormData({ ...formData, max_discount_amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Total Usage Limit</label>
                <Input
                  type="number"
                  value={formData.usage_limit}
                  onChange={(e) => setFormData({ ...formData, usage_limit: parseInt(e.target.value) || 100 })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Per Customer Limit</label>
                <Input
                  type="number"
                  value={formData.per_customer_limit}
                  onChange={(e) => setFormData({ ...formData, per_customer_limit: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" className="bg-warning hover:bg-warning text-on-primary">Save Coupon</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
