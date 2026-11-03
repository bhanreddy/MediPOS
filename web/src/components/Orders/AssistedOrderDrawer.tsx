import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface AssistedOrderDrawerProps {
  onClose: () => void;
  onSuccess: (orderId: string) => void;
}

export const AssistedOrderDrawer: React.FC<AssistedOrderDrawerProps> = ({
  onClose,
  onSuccess,
}) => {
  const [source, setSource] = useState<'PHONE' | 'WHATSAPP' | 'POS_ASSISTED'>('PHONE');
  const [fulfilmentType, setFulfilmentType] = useState<'STORE_PICKUP' | 'CLICK_COLLECT' | 'HOME_DELIVERY'>('STORE_PICKUP');
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');

  // Delivery Address Fields
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('Hyderabad');
  const [state, setState] = useState('Telangana');
  const [pincode, setPincode] = useState('500001');

  // Items
  const [items, setItems] = useState<Array<{ medicine_id: string; medicine_name: string; quantity: number; unit_type: string; mrp: number }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [quote, setQuote] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load customers
  useEffect(() => {
    api.get('/customers').then(res => {
      const list = res.data.data || res.data || [];
      setCustomers(list);
      if (list.length > 0) {
        setSelectedCustomerId(list[0].id || list[0]._local_id);
      }
    }).catch(console.error);
  }, []);

  // Search medicines
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api.get(`/pos/search?q=${encodeURIComponent(searchQuery)}`)
        .then(res => {
          setSearchResults(res.data.items || res.data || []);
        })
        .catch(console.error);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Recalculate quote whenever items or customer changes
  useEffect(() => {
    if (items.length === 0) {
      setQuote(null);
      return;
    }
    api.post('/orders/quote', {
      customer_id: selectedCustomerId || null,
      fulfilment_type: fulfilmentType,
      items: items.map(i => ({
        medicine_id: i.medicine_id,
        quantity: i.quantity,
        unit_type: i.unit_type,
      })),
    })
      .then(res => setQuote(res.data.data))
      .catch(err => console.error('Quote error:', err));
  }, [items, selectedCustomerId, fulfilmentType]);

  const handleAddItem = (med: any) => {
    const existingIndex = items.findIndex(i => i.medicine_id === (med.id || med._local_id));
    if (existingIndex >= 0) {
      const updated = [...items];
      updated[existingIndex].quantity += 1;
      setItems(updated);
    } else {
      setItems([
        ...items,
        {
          medicine_id: med.id || med._local_id,
          medicine_name: med.name,
          quantity: 1,
          unit_type: med.sale_unit || 'STRIP',
          mrp: med.mrp || 0,
        },
      ]);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, idx) => idx !== index));
  };

  const handleConfirmOrder = async () => {
    try {
      setSubmitting(true);
      setError(null);

      let custId = selectedCustomerId;
      if (!custId && newCustomerName.trim() && newCustomerPhone.trim()) {
        const custRes = await api.post('/customers', {
          name: newCustomerName.trim(),
          phone: newCustomerPhone.trim(),
        });
        custId = custRes.data.id || custRes.data._local_id;
      }

      if (!custId) {
        throw new Error('Please select or provide a customer');
      }

      if (items.length === 0) {
        throw new Error('Please add at least one item');
      }

      const payload: any = {
        customer_id: custId,
        source,
        channel: 'CALL_CENTER',
        fulfilment_type: fulfilmentType,
        items: items.map(i => ({
          medicine_id: i.medicine_id,
          quantity: i.quantity,
          unit_type: i.unit_type,
        })),
      };

      if (fulfilmentType === 'HOME_DELIVERY') {
        payload.delivery_address = {
          recipient_name: recipientName || newCustomerName || 'Recipient',
          phone: recipientPhone || newCustomerPhone || '9999999999',
          address_line_1: addressLine1 || 'Main Street',
          city,
          state,
          pincode,
        };
      }

      const res = await api.post('/orders/confirm', payload);
      alert(`✓ Order #${res.data.data.orderNumber} successfully confirmed!`);
      onSuccess(res.data.data.orderId);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to confirm order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75  z-50 flex items-center justify-end overflow-hidden animate-fadeIn">
      <div className="bg-surface border-l border-border w-full max-w-2xl h-full shadow-2xl flex flex-col overflow-hidden text-foreground-strong animate-slideLeft">
        {/* Header */}
        <div className="px-6 py-4 bg-surface-elevated border-b border-border flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-xl">📞</span>
            <h2 className="text-base font-black text-foreground-strong uppercase tracking-tight">Create Assisted Order</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground-strong text-sm">✕</button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
          {/* Channel & Fulfilment Selector */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Acquisition Source</label>
              <select
                value={source}
                onChange={e => setSource(e.target.value as any)}
                className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs font-bold text-foreground-strong focus:outline-none"
              >
                <option value="PHONE">📞 Phone Call</option>
                <option value="WHATSAPP">💬 WhatsApp Message</option>
                <option value="POS_ASSISTED">🏬 Walk-in Assisted</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Fulfilment Mode</label>
              <select
                value={fulfilmentType}
                onChange={e => setFulfilmentType(e.target.value as any)}
                className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs font-bold text-foreground-strong focus:outline-none"
              >
                <option value="STORE_PICKUP">🏬 Store Pickup</option>
                <option value="CLICK_COLLECT">🏷️ Click & Collect</option>
                <option value="HOME_DELIVERY">🛵 Home Delivery</option>
              </select>
            </div>
          </div>

          {/* Customer Selector */}
          <div className="bg-surface-elevated/50 border border-border p-4 rounded-xl space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Customer Details</h3>
            <div>
              <label className="block text-xs text-muted mb-1">Select Existing Customer</label>
              <select
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-foreground-strong"
              >
                <option value="">-- Quick New Customer --</option>
                {customers.map(c => (
                  <option key={c.id || c._local_id} value={c.id || c._local_id}>
                    {c.name} ({c.phone || 'No phone'})
                  </option>
                ))}
              </select>
            </div>

            {!selectedCustomerId && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                <Input
                  label="Customer Name"
                  value={newCustomerName}
                  onChange={e => setNewCustomerName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                />
                <Input
                  label="Phone Number"
                  value={newCustomerPhone}
                  onChange={e => setNewCustomerPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                />
              </div>
            )}
          </div>

          {/* Delivery Address if Home Delivery */}
          {fulfilmentType === 'HOME_DELIVERY' && (
            <div className="bg-surface-elevated/50 border border-border p-4 rounded-xl space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Delivery Address</h3>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Recipient Name"
                  value={recipientName}
                  onChange={e => setRecipientName(e.target.value)}
                  placeholder="e.g. Rahul"
                />
                <Input
                  label="Phone"
                  value={recipientPhone}
                  onChange={e => setRecipientPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                />
              </div>
              <Input
                label="Address Line 1"
                value={addressLine1}
                onChange={e => setAddressLine1(e.target.value)}
                placeholder="House / Flat #, Street name"
              />
              <div className="grid grid-cols-3 gap-2">
                <Input label="City" value={city} onChange={e => setCity(e.target.value)} />
                <Input label="State" value={state} onChange={e => setState(e.target.value)} />
                <Input label="Pincode" value={pincode} onChange={e => setPincode(e.target.value)} />
              </div>
            </div>
          )}

          {/* Product Search & Item Entry */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Order Line Items</h3>
            <div className="relative">
              <input
                type="text"
                placeholder="Search medicine / product by name or composition..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-surface-elevated border border-border rounded-lg px-4 py-2.5 text-xs text-foreground-strong placeholder-slate-400 focus:outline-none focus:border-primary"
              />

              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-surface-elevated border border-border rounded-xl shadow-2xl z-30 max-h-48 overflow-y-auto divide-y divide-border">
                  {searchResults.map(med => (
                    <div
                      key={med.id || med._local_id}
                      onClick={() => handleAddItem(med)}
                      className="p-3 hover:bg-surface-alt cursor-pointer flex justify-between items-center text-xs"
                    >
                      <div>
                        <strong className="text-foreground-strong">{med.name}</strong>
                        <p className="text-[10px] text-muted">{med.brand_name} • Unit: {med.sale_unit || 'STRIP'}</p>
                      </div>
                      <span className="font-mono text-success font-bold">₹{med.mrp || 0}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Added Items List */}
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-elevated text-muted font-bold uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="p-3">Product</th>
                    <th className="p-3 text-center">Qty</th>
                    <th className="p-3 text-right">Price</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-muted text-xs">
                        No items added yet. Search above to add medicines.
                      </td>
                    </tr>
                  ) : (
                    items.map((it, idx) => (
                      <tr key={it.medicine_id}>
                        <td className="p-3 font-semibold text-foreground-strong">{it.medicine_name}</td>
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            min="1"
                            value={it.quantity}
                            onChange={e => {
                              const updated = [...items];
                              updated[idx].quantity = Math.max(1, Number(e.target.value));
                              setItems(updated);
                            }}
                            className="w-16 bg-background border border-border rounded px-2 py-1 text-center text-xs text-foreground-strong font-mono"
                          />
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-foreground-strong">
                          ₹{(it.mrp * it.quantity).toFixed(2)}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleRemoveItem(idx)}
                            className="text-danger hover:text-danger px-2 py-1"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Live Quote Breakdown */}
          {quote && (
            <div className="bg-surface-elevated/80 border border-border p-4 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between text-foreground">
                <span>Subtotal:</span>
                <span className="font-mono">₹{quote.subtotal?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-success">
                <span>Discount:</span>
                <span className="font-mono">-₹{quote.discountTotal?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-foreground">
                <span>GST:</span>
                <span className="font-mono">₹{quote.taxTotal?.toFixed(2)}</span>
              </div>
              {quote.deliveryCharge > 0 && (
                <div className="flex justify-between text-foreground">
                  <span>Delivery Charge:</span>
                  <span className="font-mono">₹{quote.deliveryCharge?.toFixed(2)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-border flex justify-between text-sm font-bold text-foreground-strong">
                <span>Grand Total:</span>
                <span className="font-mono text-success text-base">₹{quote.grandTotal?.toFixed(2)}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs font-semibold text-danger bg-danger/8 border border-danger/25 p-3 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-surface-elevated border-t border-border flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            className="font-bold"
            disabled={submitting || items.length === 0}
            onClick={handleConfirmOrder}
          >
            {submitting ? 'Confirming Order...' : '✓ Confirm & Reserve Order'}
          </Button>
        </div>
      </div>
    </div>
  );
};
