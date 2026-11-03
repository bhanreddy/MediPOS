import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Sparkles, Plus, Percent, Gift } from 'lucide-react';

export const PromotionsPage: React.FC = () => {
  const [promotions, setPromotions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    promotion_type: 'PERCENTAGE_DISCOUNT',
    discount_pct: 10,
    buy_qty: 2,
    get_free_qty: 1,
    priority: 10,
    stackability: 'STACKABLE',
  });

  const fetchPromotions = async () => {
    try {
      setLoading(true);
      const res = await api.get('/commercial/promotions');
      setPromotions(res.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch promotions', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromotions();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let config_json: any = {};
      if (formData.promotion_type === 'PERCENTAGE_DISCOUNT') {
        config_json = { percentage_discount: Number(formData.discount_pct) };
      } else if (formData.promotion_type === 'BUY_X_GET_Y') {
        config_json = { buy_qty: Number(formData.buy_qty), get_free_qty: Number(formData.get_free_qty) };
      }

      await api.post('/commercial/promotions', {
        code: formData.code.toUpperCase(),
        name: formData.name,
        description: formData.description,
        promotion_type: formData.promotion_type,
        priority: formData.priority,
        stackability: formData.stackability,
        config_json,
      });

      setShowModal(false);
      fetchPromotions();
    } catch (err) {
      console.error('Failed to create promotion', err);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground-strong tracking-tight flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-success" />
            Promotions
          </h1>
          <p className="text-muted text-sm mt-1">
            Build and deploy Percentage, Buy X Get Y, Quantity Slabs, Bundles, and Best Customer Offer rules.
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-success hover:bg-success text-on-primary">
          <Plus className="w-4 h-4" /> Create Promotion
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-3 text-center py-12 text-muted">Loading active promotions...</div>
        ) : promotions.length === 0 ? (
          <Card className="col-span-3 p-12 text-center text-muted">
            <Sparkles className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="font-semibold text-foreground">No active promotions created</p>
            <p className="text-sm text-muted mt-1">Create promotional rules to drive pharmacy counter sales.</p>
          </Card>
        ) : (
          promotions.map((p) => (
            <Card key={p.id || p._local_id} className="p-5 border border-border hover:shadow-lg transition">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-success/8 text-success">
                    {p.promotion_type === 'BUY_X_GET_Y' ? <Gift className="w-5 h-5" /> : <Percent className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground-strong">{p.name}</h3>
                    <span className="inline-block font-mono text-xs bg-surface-alt text-foreground px-2 py-0.5 rounded font-semibold mt-0.5">
                      {p.code}
                    </span>
                  </div>
                </div>
                <Badge variant={p.status === 'ACTIVE' ? 'success' : 'neutral'}>{p.status}</Badge>
              </div>

              <p className="text-xs text-muted mt-3">{p.description || 'Applies to qualifying cart items'}</p>

              <div className="mt-4 pt-3 border-t border-border grid grid-cols-2 gap-2 text-xs text-foreground">
                <div>
                  <span className="text-muted block">Type:</span>
                  <span className="font-medium text-foreground-strong">{p.promotion_type}</span>
                </div>
                <div>
                  <span className="text-muted block">Stacking:</span>
                  <span className="font-medium text-primary">{p.stackability}</span>
                </div>
                <div>
                  <span className="text-muted block">Redemptions:</span>
                  <span className="font-medium text-success">{p.total_applications || 0} times</span>
                </div>
                <div>
                  <span className="text-muted block">Priority:</span>
                  <span className="font-medium text-foreground-strong">{p.priority}</span>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {showModal && (
        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Create Promotion Rule">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Promo Code</label>
                <Input
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g. WELLNESS10"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Promotion Name</label>
                <Input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="10% Off Cetaphil Range"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Promotion Type</label>
              <select
                className="w-full border border-border rounded-md p-2 text-sm bg-surface"
                value={formData.promotion_type}
                onChange={(e) => setFormData({ ...formData, promotion_type: e.target.value })}
              >
                <option value="PERCENTAGE_DISCOUNT">Percentage Discount (% Off)</option>
                <option value="BUY_X_GET_Y">Buy X Get Y Free</option>
                <option value="FLAT_DISCOUNT">Flat Rupee Discount</option>
                <option value="FIXED_PRICE">Fixed Special Offer Price</option>
                <option value="QUANTITY_SLAB">Quantity Tier Slabs</option>
                <option value="BUNDLE">Bundle / Combo Offer</option>
              </select>
            </div>

            {formData.promotion_type === 'PERCENTAGE_DISCOUNT' && (
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Discount Percentage (%)</label>
                <Input
                  type="number"
                  value={formData.discount_pct}
                  onChange={(e) => setFormData({ ...formData, discount_pct: parseFloat(e.target.value) || 0 })}
                />
              </div>
            )}

            {formData.promotion_type === 'BUY_X_GET_Y' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Buy Quantity (X)</label>
                  <Input
                    type="number"
                    value={formData.buy_qty}
                    onChange={(e) => setFormData({ ...formData, buy_qty: parseInt(e.target.value) || 2 })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Get Free Quantity (Y)</label>
                  <Input
                    type="number"
                    value={formData.get_free_qty}
                    onChange={(e) => setFormData({ ...formData, get_free_qty: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Stackability</label>
                <select
                  className="w-full border border-border rounded-md p-2 text-sm bg-surface"
                  value={formData.stackability}
                  onChange={(e) => setFormData({ ...formData, stackability: e.target.value })}
                >
                  <option value="STACKABLE">Stackable with others</option>
                  <option value="EXCLUSIVE">Exclusive (Best Offer Only)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Priority</label>
                <Input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 10 })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" className="bg-success hover:bg-success text-on-primary">Save Promotion</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
