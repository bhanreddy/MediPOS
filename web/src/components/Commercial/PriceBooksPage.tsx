import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { BookOpen, Plus } from 'lucide-react';

export const PriceBooksPage: React.FC = () => {
  const [priceBooks, setPriceBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    scope_type: 'STORE',
    priority: 10,
    currency: 'INR',
  });

  const fetchPriceBooks = async () => {
    try {
      setLoading(true);
      const res = await api.get('/commercial/price-books');
      setPriceBooks(res.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch price books', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPriceBooks();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/commercial/price-books', formData);
      setShowCreateModal(false);
      setFormData({ name: '', description: '', scope_type: 'STORE', priority: 10, currency: 'INR' });
      fetchPriceBooks();
    } catch (err) {
      console.error('Failed to create price book', err);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground-strong tracking-tight flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-primary" />
            Price books
          </h1>
          <p className="text-muted text-sm mt-1">
            Manage prices across stores, regions, and customer groups.
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 bg-primary hover:bg-primary text-on-primary">
          <Plus className="w-4 h-4" /> Create Price Book
        </Button>
      </div>

      {/* Priority Hierarchy Visualizer */}
      <section className="price-hierarchy">
        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground font-semibold">Pricing priority</span>
          <span className="text-xs text-primary font-medium">Margin protection</span>
        </div>
        <div className="grid grid-cols-5 gap-3 mt-3">
          <div>
            <div className="text-xs font-bold text-primary">1. Store Override</div>
            <div className="text-xs text-muted mt-1">Store-specific prices</div>
          </div>
          <div>
            <div className="text-xs font-bold text-success">2. Regional Book</div>
            <div className="text-xs text-muted mt-1">Territory and zone pricing</div>
          </div>
          <div>
            <div className="text-xs font-bold text-info">3. Org Global</div>
            <div className="text-xs text-muted mt-1">Organization standard</div>
          </div>
          <div>
            <div className="text-xs font-bold text-violet">4. Group/Tier</div>
            <div className="text-xs text-muted mt-1">Member discounts</div>
          </div>
          <div>
            <div className="text-xs font-bold text-warning">5. Master Default</div>
            <div className="text-xs text-muted mt-1">Catalog base price</div>
          </div>
        </div>
      </section>

      {/* Price Books List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-3 text-center py-12 text-muted">Loading price books...</div>
        ) : priceBooks.length === 0 ? (
          <Card className="col-span-3 p-12 text-center text-muted">
            <BookOpen className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="font-semibold text-foreground">No active price books found</p>
            <p className="text-sm text-muted mt-1">Default catalog MRP hierarchy will apply during checkout.</p>
          </Card>
        ) : (
          priceBooks.map((pb) => (
            <Card key={pb.id || pb._local_id} className="p-5 border border-border hover:shadow-lg transition">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-foreground-strong text-lg">{pb.name}</h3>
                  <p className="text-xs text-muted mt-0.5">{pb.description || 'No description provided'}</p>
                </div>
                <Badge variant={pb.status === 'ACTIVE' ? 'success' : 'neutral'}>{pb.status}</Badge>
              </div>

              <div className="mt-4 pt-4 border-t border-border space-y-2 text-xs text-foreground">
                <div className="flex justify-between">
                  <span>Scope Type:</span>
                  <span className="font-semibold text-foreground-strong">{pb.scope_type}</span>
                </div>
                <div className="flex justify-between">
                  <span>Priority Weight:</span>
                  <span className="font-semibold text-primary">{pb.priority}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Priced SKUs:</span>
                  <span className="font-semibold text-foreground-strong">{pb.total_items || 0} items</span>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create New Price Book">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Price Book Name</label>
              <Input
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Flagship Hospital Store Pricing"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Description</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Special discounted catalog for central clinic location"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Scope Type</label>
                <select
                  className="w-full border border-border rounded-md p-2 text-sm bg-surface"
                  value={formData.scope_type}
                  onChange={(e) => setFormData({ ...formData, scope_type: e.target.value })}
                >
                  <option value="STORE">Store Specific</option>
                  <option value="REGION">Regional Zone</option>
                  <option value="ORGANIZATION">Organization Wide</option>
                  <option value="CUSTOMER_GROUP">Customer Group</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Resolution Priority</label>
                <Input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 10 })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              <Button type="submit" className="bg-primary hover:bg-primary text-on-primary">Save Price Book</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
