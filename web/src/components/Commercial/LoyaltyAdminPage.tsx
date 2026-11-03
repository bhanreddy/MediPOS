import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Award, Coins, Users } from 'lucide-react';

export const LoyaltyAdminPage: React.FC = () => {
  const [program, setProgram] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    customer_id: '',
    credits: 100,
    notes: 'Admin bonus credits',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [progRes, grpRes] = await Promise.all([
        api.get('/commercial/loyalty/program'),
        api.get('/commercial/customer-groups'),
      ]);
      setProgram(progRes.data?.data || null);
      setGroups(grpRes.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch loyalty admin data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/commercial/loyalty/adjust', adjustForm);
      setShowAdjustModal(false);
      setAdjustForm({ customer_id: '', credits: 100, notes: 'Admin bonus credits' });
    } catch (err) {
      console.error('Failed to adjust credits', err);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted">Loading loyalty configuration...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground-strong tracking-tight flex items-center gap-2">
            <Award className="w-7 h-7 text-violet" />
            Loyalty & customer groups
          </h1>
          <p className="text-muted text-sm mt-1">
            Manage loyalty points, customer groups, and redemption rules.
          </p>
        </div>
        <Button onClick={() => setShowAdjustModal(true)} className="flex items-center gap-2 bg-violet hover:bg-violet text-on-primary">
          <Coins className="w-4 h-4" /> Adjust Customer Credits
        </Button>
      </div>

      {/* Program Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-violet/25">
          <span className="text-xs text-muted uppercase font-semibold">Earn Rate</span>
          <div className="text-xl font-bold text-foreground-strong mt-1">
            ₹{(program?.earn_rate_spend_paise || 10000) / 100} Spend = {program?.credits_per_earn_unit || 1} Point
          </div>
          <span className="text-xs text-muted">Excludes GST taxes</span>
        </Card>

        <Card className="p-4 border-l-4 border-success/25">
          <span className="text-xs text-muted uppercase font-semibold">Burn Rate</span>
          <div className="text-xl font-bold text-foreground-strong mt-1">100 Points = ₹25</div>
          <span className="text-xs text-muted">25 paise per credit point</span>
        </Card>

        <Card className="p-4 border-l-4 border-warning/25">
          <span className="text-xs text-muted uppercase font-semibold">Max Redemption</span>
          <div className="text-xl font-bold text-foreground-strong mt-1">50% Bill Value</div>
          <span className="text-xs text-muted">Min redemption 50 points</span>
        </Card>

        <Card className="p-4 border-l-4 border-primary/25">
          <span className="text-xs text-muted uppercase font-semibold">Point Expiry</span>
          <div className="text-xl font-bold text-foreground-strong mt-1">365 Days</div>
          <span className="text-xs text-muted">FIFO credit lifecycle</span>
        </Card>
      </div>

      {/* Tiered Customer Groups */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-foreground-strong mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-violet" />
          Customer Groups & Tier Multipliers
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {groups.length === 0 ? (
            <div className="col-span-3 text-muted py-6 text-center text-sm">No special customer groups created.</div>
          ) : (
            groups.map((g) => (
              <div key={g.id || g._local_id} className="p-4 rounded-xl border border-border bg-surface-elevated/50">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-foreground-strong">{g.name}</span>
                  <Badge variant="primary">{g.code}</Badge>
                </div>
                <div className="mt-3 space-y-1 text-xs text-foreground">
                  <div className="flex justify-between">
                    <span>Direct Discount:</span>
                    <span className="font-semibold text-violet">{g.discount_pct}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Priority Level:</span>
                    <span className="font-semibold text-foreground-strong">{g.priority}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {showAdjustModal && (
        <Modal isOpen={showAdjustModal} onClose={() => setShowAdjustModal(false)} title="Manual Credit Adjustment">
          <form onSubmit={handleAdjust} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Customer ID</label>
              <Input
                required
                value={adjustForm.customer_id}
                onChange={(e) => setAdjustForm({ ...adjustForm, customer_id: e.target.value })}
                placeholder="Enter customer ID or phone"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Credit Adjustment (+ or -)</label>
              <Input
                type="number"
                required
                value={adjustForm.credits}
                onChange={(e) => setAdjustForm({ ...adjustForm, credits: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Reason / Notes</label>
              <Input
                required
                value={adjustForm.notes}
                onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
                placeholder="e.g. VIP Customer Onboarding Bonus"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="secondary" onClick={() => setShowAdjustModal(false)}>Cancel</Button>
              <Button type="submit" className="bg-violet hover:bg-violet text-on-primary">Apply Adjustment</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
