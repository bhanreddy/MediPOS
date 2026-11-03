import React, { useState, useEffect } from 'react';
import api from '../../lib/api';

export const SupplierPayablesView: React.FC = () => {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [ageingData, setAgeingData] = useState<any[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);

  // Payment Form State
  const [paymentAmountRupees, setPaymentAmountRupees] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<string>('BANK_TRANSFER');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const fetchSuppliersAndAgeing = async () => {
    setIsLoading(true);
    try {
      const [suppRes, ageRes] = await Promise.all([
        api.get('/suppliers'),
        api.get('/procurement/payables/ageing'),
      ]);
      if (suppRes.data?.data) setSuppliers(suppRes.data.data);
      if (ageRes.data?.data) {
        setAgeingData(ageRes.data.data);
        if (ageRes.data.data.length > 0 && !selectedSupplierId) {
          setSelectedSupplierId(ageRes.data.data[0].supplierId);
        }
      }
    } catch (err) {
      console.error('Failed to load supplier payables:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLedger = async (suppId: string) => {
    if (!suppId) return;
    try {
      const res = await api.get(`/procurement/payables/ledger?supplier_id=${suppId}`);
      if (res.data?.data) {
        setLedgerEntries(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load ledger:', err);
    }
  };

  useEffect(() => {
    fetchSuppliersAndAgeing();
  }, []);

  useEffect(() => {
    if (selectedSupplierId) {
      fetchLedger(selectedSupplierId);
    }
  }, [selectedSupplierId]);

  const handleRecordPayment = async () => {
    if (!selectedSupplierId || paymentAmountRupees <= 0) {
      alert('Valid supplier and payment amount required');
      return;
    }
    try {
      await api.post('/procurement/payments', {
        supplierId: selectedSupplierId,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMode,
        referenceNumber,
        amountPaise: Math.round(paymentAmountRupees * 100),
        notes,
      });
      setIsPaymentModalOpen(false);
      setPaymentAmountRupees(0);
      setReferenceNumber('');
      fetchSuppliersAndAgeing();
      fetchLedger(selectedSupplierId);
      alert('Payment recorded and allocated successfully!');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to record payment');
    }
  };

  const formatRupees = (paise: number) => {
    return `₹${((paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* AGEING SUMMARY CARDS */}
      <div className="bg-surface-elevated/60 p-4 rounded-xl border border-border space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground-strong">
              Supplier Overdue Ageing Analysis
            </h2>
            {isLoading && <span className="text-xs text-warning font-semibold animate-pulse">Loading Payables...</span>}
          </div>
          <button
            onClick={() => setIsPaymentModalOpen(true)}
            className="px-3 py-1.5 text-xs font-bold rounded bg-success hover:bg-success text-on-primary transition flex items-center gap-1"
          >
            💳 Record Supplier Payment
          </button>
        </div>

        <div className="grid grid-cols-5 gap-3">
          {['Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days'].map((bucket, i) => {
            const sumPaise = ageingData.reduce((acc, a) => {
              if (i === 0) return acc + (a.currentPaise || 0);
              if (i === 1) return acc + (a.days1_30Paise || 0);
              if (i === 2) return acc + (a.days31_60Paise || 0);
              if (i === 3) return acc + (a.days61_90Paise || 0);
              return acc + (a.days90PlusPaise || 0);
            }, 0);

            return (
              <div key={bucket} className="p-3 bg-surface/70 rounded-lg border border-border">
                <div className="text-[10px] uppercase font-bold text-muted">{bucket}</div>
                <div className={`text-base font-black mt-1 ${i >= 3 ? 'text-danger' : i === 0 ? 'text-success' : 'text-warning'}`}>
                  {formatRupees(sumPaise)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SPLIT VIEW: SUPPLIERS LIST + LEDGER STATEMENT */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* SUPPLIER BALANCES LIST */}
        <div className="bg-surface-elevated/40 rounded-xl border border-border overflow-hidden flex flex-col">
          <div className="p-3 bg-surface-elevated/90 border-b border-border text-xs font-bold uppercase text-foreground">
            Supplier Outstanding ({suppliers.length})
          </div>
          <div className="overflow-y-auto flex-1 divide-y divide-border">
            {suppliers.map((s) => (
              <div
                key={s.id}
                onClick={() => setSelectedSupplierId(s.id)}
                className={`p-3 hover:bg-surface-alt/50 cursor-pointer transition flex justify-between items-center ${
                  selectedSupplierId === s.id ? 'bg-surface-alt/70 border-l-4 border-success/25' : ''
                }`}
              >
                <div>
                  <div className="font-bold text-foreground-strong text-xs">{s.name}</div>
                  <div className="text-[11px] text-muted">{s.phone || 'No phone'}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-danger text-xs">
                    ₹{Number(s.outstanding_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TRANSACTION-LEVEL PAYABLE LEDGER */}
        <div className="md:col-span-2 bg-surface-elevated/40 rounded-xl border border-border overflow-hidden flex flex-col">
          <div className="p-3 bg-surface-elevated/90 border-b border-border flex justify-between items-center">
            <span className="text-xs font-bold uppercase text-foreground">
              Payable Ledger Statement & Audit Trail
            </span>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface text-muted uppercase text-[10px]">
                  <th className="p-2.5">Date</th>
                  <th className="p-2.5">Type</th>
                  <th className="p-2.5">Reference #</th>
                  <th className="p-2.5 text-right">Debit (Payment/DN)</th>
                  <th className="p-2.5 text-right">Credit (Invoice)</th>
                  <th className="p-2.5 text-right">Balance After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ledgerEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-surface-elevated/60 font-mono text-[11px]">
                    <td className="p-2.5 text-muted">
                      {e.created_at ? new Date(e.created_at).toLocaleDateString('en-IN') : 'N/A'}
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                          e.transaction_type === 'PAYMENT'
                            ? 'bg-success/8 text-success'
                            : e.transaction_type === 'DEBIT_NOTE'
                            ? 'bg-violet/8 text-violet'
                            : 'bg-danger/8 text-danger'
                        }`}
                      >
                        {e.transaction_type}
                      </span>
                    </td>
                    <td className="p-2.5 text-foreground-strong">{e.reference_number || e.reference_id}</td>
                    <td className="p-2.5 text-right text-success font-bold">
                      {e.debit_paise > 0 ? formatRupees(e.debit_paise) : '—'}
                    </td>
                    <td className="p-2.5 text-right text-danger font-bold">
                      {e.credit_paise > 0 ? formatRupees(e.credit_paise) : '—'}
                    </td>
                    <td className="p-2.5 text-right text-foreground-strong font-bold">
                      {formatRupees(e.balance_after_paise)}
                    </td>
                  </tr>
                ))}
                {ledgerEntries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted">
                      No payable ledger transactions recorded for this supplier.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* RECORD PAYMENT MODAL */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-surface-elevated border border-border rounded-xl max-w-md w-full p-6 space-y-4 text-foreground-strong shadow-2xl">
            <h3 className="text-base font-bold uppercase tracking-wider text-success">Record Supplier Payment</h3>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Supplier</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (Bal: ₹{s.outstanding_balance || 0})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={paymentAmountRupees}
                  onChange={(e) => setPaymentAmountRupees(Number(e.target.value))}
                  className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">Payment Mode</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
                >
                  <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                  <option value="UPI">UPI Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CASH">Cash</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Reference / UTR #</label>
              <input
                type="text"
                placeholder="e.g. UTR-90823412"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Payment Notes / Narration</label>
              <input
                type="text"
                placeholder="Optional payment notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-surface border border-border rounded p-2 text-xs text-foreground-strong"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold rounded bg-surface-alt hover:bg-surface-alt text-foreground-strong"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                className="px-3 py-1.5 text-xs font-bold rounded bg-success hover:bg-success text-on-primary"
              >
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
