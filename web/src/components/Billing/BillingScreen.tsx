import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { usePosStore } from '../../store/posStore';
import type { PosPaymentTender } from '../../store/posStore';
import { usePosKeyboardShortcuts } from '../../hooks/usePosKeyboardShortcuts';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { buildUpiPaymentUri } from '../../lib/upiPaymentUri';
import { useUpiId } from '../../hooks/useUpiId';
import { useShopDisplayName } from '../../hooks/useShopDisplayName';
import api from '../../lib/api';
import { useSelector } from 'react-redux';
import type { RootState } from '../../state/store';

export const BillingScreen: React.FC = () => {
  const { user } = useSelector((s: RootState) => s.auth);
  const { upiId } = useUpiId();
  const shopName = useShopDisplayName();

  // POS Store
  const {
    cart,
    customer_id,
    customer_name,
    customer_phone,
    doctor_name,
    doctor_registration_number,
    prescription_number,
    bill_discount,
    coupon_code,
    redeem_loyalty_credits,
    park_id,
    park_token,
    supervisor_auth_id,
    addItem,
    updateLineQuantity,
    updateLineUnit,
    updateLineDiscount,
    removeLine,
    clearCart,
    setCustomer,
    setDoctor,
    setPrescription,
    setBillDiscount,
    setCouponCode,
    setRedeemLoyaltyCredits,
    setParkedToken,
    reset,
  } = usePosStore();

  // POS Session Status
  const [session, setSession] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [substitutes, setSubstitutes] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSearchIdx, setSelectedSearchIdx] = useState(0);

  // Quote State
  const [quote, setQuote] = useState<any>(null);
  const [isQuoting, setIsQuoting] = useState(false);

  // Modals
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isParkModalOpen, setIsParkModalOpen] = useState(false);
  const [isRecallModalOpen, setIsRecallModalOpen] = useState(false);
  const [isSupervisorModalOpen, setIsSupervisorModalOpen] = useState(false);
  const [isReturnsModalOpen, setIsReturnsModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [lastBillData, setLastBillData] = useState<any>(null);
  const [parkedBills, setParkedBills] = useState<any[]>([]);

  // Split Payment Inputs
  const [splitCash, setSplitCash] = useState('');
  const [splitUpi, setSplitUpi] = useState('');
  const [splitCard, setSplitCard] = useState('');
  const [splitCredit, setSplitCredit] = useState('');
  const [upiRefId, setUpiRefId] = useState('');
  const [cardRefNo, setCardRefNo] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);

  // DOM Refs for Keyboard Control
  const searchInputRef = useRef<HTMLInputElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const discountInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch POS Session
  const loadSession = useCallback(async () => {
    try {
      const res = await api.get('/pos/session');
      setSession(res.data?.data);
    } catch {
      // Offline fallback
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // 2. Perform Live Unified Product Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSubstitutes([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.get(`/pos/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(res.data?.results || []);
        setSubstitutes(res.data?.substitutes || []);
        setSelectedSearchIdx(0);
      } catch {
        // Search error
      } finally {
        setIsSearching(false);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 3. Fetch Server-Side Cart Quote whenever cart or discounts change
  useEffect(() => {
    if (cart.length === 0) {
      setQuote(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsQuoting(true);
      try {
        const res = await api.post('/pos/quote', {
          items: cart.map(line => ({
            medicine_id: line.medicine_id,
            quantity: line.quantity,
            unit_type: line.unit_type,
            conversion_factor: line.conversion_factor,
            discount_pct: line.discount_pct,
            batch_id: line.manual_batch_id || undefined,
          })),
          customer_id,
          coupon_code: coupon_code || undefined,
          redeem_loyalty_credits: Number(redeem_loyalty_credits || 0),
          bill_discount: parseFloat(bill_discount) || 0,
        });
        setQuote(res.data?.data);
      } catch {
        // Quote error
      } finally {
        setIsQuoting(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [cart, customer_id, bill_discount, coupon_code, redeem_loyalty_credits]);

  // 4. Barcode Scanner Fast Global Listener
  useBarcodeScanner({
    onScan: async (barcode) => {
      try {
        const res = await api.get(`/pos/search?barcode=${encodeURIComponent(barcode)}`);
        const items = res.data?.results || [];
        if (items.length > 0) {
          const item = items[0];
          const matched = item.matched_barcode;
          addItem({
            medicine_id: item.id,
            medicine_name: item.name,
            generic_name: item.generic_name,
            brand_name: item.brand_name,
            dosage_form: item.dosage_form,
            strength: item.strength,
            unit_type: matched?.unit_type || item.sale_unit || 'STRIP',
            conversion_factor: matched?.conversion_factor || item.conversion_factor || 1.0,
            quantity: 1,
            mrp: item.mrp,
            unit_price: item.selling_price,
            discount_pct: 0,
            gst_rate: item.gst_rate,
            prescription_required: item.prescription_required,
            schedule_classification: item.schedule_classification,
            cold_chain_required: item.cold_chain_required,
            batch_allocations: [],
            warnings: [],
          });
          setSearchQuery('');
        }
      } catch {
        // Scan handle error
      }
    },
  });

  // 5. Keyboard Shortcut Engine (F2-F10)
  usePosKeyboardShortcuts({
    onSearchFocus: () => searchInputRef.current?.focus(),
    onCustomerFocus: () => customerInputRef.current?.focus(),
    onDiscountFocus: () => discountInputRef.current?.focus(),
    onParkSale: () => setIsParkModalOpen(true),
    onRecallSale: async () => {
      try {
        const res = await api.get('/pos/parked');
        setParkedBills(res.data?.data || []);
        setIsRecallModalOpen(true);
      } catch {
        // Recall fetch error
      }
    },
    onCheckout: () => {
      if (cart.length > 0) {
        setSplitCash(String(quote?.grandTotal || ''));
        setSplitUpi('');
        setSplitCard('');
        setSplitCredit('');
        setIsCheckoutModalOpen(true);
      }
    },
    onPrintLastBill: () => {
      if (lastBillData) setIsReceiptModalOpen(true);
    },
    onReturns: () => setIsReturnsModalOpen(true),
    onClearCart: () => clearCart(),
    onEscape: () => {
      setIsCheckoutModalOpen(false);
      setIsParkModalOpen(false);
      setIsRecallModalOpen(false);
      setIsSupervisorModalOpen(false);
      setIsReturnsModalOpen(false);
      setIsReceiptModalOpen(false);
    },
  });

  // Add Product from Search Table
  const handleSelectProduct = (p: any) => {
    addItem({
      medicine_id: p.id,
      medicine_name: p.name,
      generic_name: p.generic_name,
      brand_name: p.brand_name,
      dosage_form: p.dosage_form,
      strength: p.strength,
      unit_type: p.sale_unit || 'STRIP',
      conversion_factor: p.conversion_factor || 1.0,
      quantity: 1,
      mrp: p.mrp,
      unit_price: p.selling_price,
      discount_pct: 0,
      gst_rate: p.gst_rate,
      prescription_required: p.prescription_required,
      schedule_classification: p.schedule_classification,
      cold_chain_required: p.cold_chain_required,
      batch_allocations: [],
      warnings: [],
    });
    setSearchQuery('');
    setSearchResults([]);
    searchInputRef.current?.focus();
  };

  // Perform Final Checkout Transaction
  const handleFinalCheckout = async () => {
    if (!quote || cart.length === 0) return;

    const cash = parseFloat(splitCash) || 0;
    const upi = parseFloat(splitUpi) || 0;
    const card = parseFloat(splitCard) || 0;
    const credit = parseFloat(splitCredit) || 0;

    const paymentRows: PosPaymentTender[] = [];
    if (cash > 0) paymentRows.push({ tender_type: 'CASH', amount: cash });
    if (upi > 0) paymentRows.push({ tender_type: 'UPI', amount: upi, reference_number: upiRefId });
    if (card > 0) paymentRows.push({ tender_type: 'CARD', amount: card, reference_number: cardRefNo });
    if (credit > 0) paymentRows.push({ tender_type: 'CREDIT', amount: credit });

    if (paymentRows.length === 0) {
      paymentRows.push({ tender_type: 'CASH', amount: quote.grandTotal });
    }

    setIsCommitting(true);
    try {
      const res = await api.post('/pos/checkout', {
        items: cart.map(l => ({
          medicine_id: l.medicine_id,
          quantity: l.quantity,
          unit_type: l.unit_type,
          conversion_factor: l.conversion_factor,
          discount_pct: l.discount_pct,
          batch_id: l.manual_batch_id || undefined,
        })),
        customer_id: customer_id || undefined,
        doctor_name: doctor_name || undefined,
        doctor_registration_number: doctor_registration_number || undefined,
        prescription_number: prescription_number || undefined,
        coupon_code: coupon_code || undefined,
        redeem_loyalty_credits: Number(redeem_loyalty_credits || 0),
        bill_discount: parseFloat(bill_discount) || 0,
        payments: paymentRows,
        park_id: park_id || undefined,
        supervisor_auth_id: supervisor_auth_id || undefined,
      });

      const billResult = res.data?.data;
      setLastBillData(billResult);
      setIsCheckoutModalOpen(false);
      setIsReceiptModalOpen(true);
      reset();
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Checkout failed');
    } finally {
      setIsCommitting(false);
    }
  };

  // Park Sale
  const handleParkSale = async () => {
    try {
      const res = await api.post('/pos/park', {
        cart,
        customer: { id: customer_id, name: customer_name, phone: customer_phone },
        totals: quote,
      });
      alert(`Sale parked successfully with Token: ${res.data?.data?.park_token}`);
      setIsParkModalOpen(false);
      clearCart();
    } catch {
      alert('Failed to park sale');
    }
  };

  // Resume Parked Sale
  const handleResumeParked = async (pId: string) => {
    try {
      const res = await api.post(`/pos/parked/${pId}/resume`);
      const resumed = res.data?.data;
      clearCart();
      for (const item of resumed.cart_snapshot || []) {
        addItem(item);
      }
      if (resumed.customer_snapshot) {
        setCustomer(resumed.customer_snapshot.id, resumed.customer_snapshot.name, resumed.customer_snapshot.phone);
      }
      setParkedToken(resumed.id, resumed.park_token);
      setIsRecallModalOpen(false);
    } catch {
      alert('Failed to resume parked bill');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* ── TOP OPERATIONAL STATUS BAR ────────────────────────────────────── */}
      <header className="h-11 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between text-xs select-none">
        <div className="flex items-center space-x-4">
          <span className="font-bold text-emerald-400 tracking-wider">POS COUNTER V2</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-300">
            Store: <strong className="text-white">{session?.storeCode || 'MAIN'}</strong> ({session?.storeName || 'Main Store'})
          </span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-300">
            Counter: <strong className="text-white">{session?.counterCode || 'C1'}</strong>
          </span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-300">
            Terminal: <strong className="text-white">{session?.terminalCode || 'T1'}</strong>
          </span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-300">
            Cashier: <strong className="text-white">{session?.userName || user?.name || 'Operator'}</strong>
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <Badge variant={session?.syncStatus === 'SYNCED' ? 'success' : 'warning'}>
            {session?.syncStatus || 'SYNCED'}
          </Badge>
          <Badge variant="success">ONLINE</Badge>
          {park_token && (
            <Badge variant="neutral">
              HOLD: #{park_token}
            </Badge>
          )}
        </div>
      </header>

      {/* ── MAIN 3-PANE WORKSPACE ─────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT PANE: SEARCH & PRODUCT CATALOGUE (28%) ─────────────────── */}
        <section className="w-[30%] border-r border-slate-800 bg-slate-900/50 flex flex-col">
          <div className="p-3 border-b border-slate-800 bg-slate-900">
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Scan Barcode or Search [F2]..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                autoFocus
              />
              {isSearching && (
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 animate-pulse">
                  Searching...
                </span>
              )}
            </div>
          </div>

          {/* Search Result Grid */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {searchResults.map((p, idx) => (
              <div
                key={p.id}
                onClick={() => handleSelectProduct(p)}
                className={`p-2.5 rounded border transition-colors cursor-pointer ${
                  idx === selectedSearchIdx
                    ? 'bg-emerald-950/40 border-emerald-500/60'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-sm text-white">{p.name}</h4>
                    <p className="text-xs text-slate-400">{p.generic_name || p.brand_name || 'Generic'}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-emerald-400">₹{p.selling_price?.toFixed(2)}</span>
                    <p className="text-[11px] text-slate-400">Stock: {p.total_available_stock}</p>
                  </div>
                </div>

                <div className="mt-2 flex items-center space-x-2 text-[11px]">
                  {p.prescription_required && (
                    <span className="bg-rose-950 text-rose-300 px-1.5 py-0.5 rounded border border-rose-800 font-mono">
                      Rx {p.schedule_classification}
                    </span>
                  )}
                  {p.nearest_expiry && (
                    <span className="text-slate-400">Exp: {p.nearest_expiry}</span>
                  )}
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-400">{p.sale_unit?.toUpperCase()}</span>
                </div>
              </div>
            ))}

            {substitutes.length > 0 && (
              <div className="p-2 bg-amber-950/30 border border-amber-800/40 rounded mt-2">
                <span className="text-[11px] font-bold text-amber-400">Generic Substitutes:</span>
                <div className="mt-1 space-y-1">
                  {substitutes.map(s => (
                    <div
                      key={s.id}
                      onClick={() => handleSelectProduct(s)}
                      className="text-xs text-amber-200 hover:text-white cursor-pointer flex justify-between p-1 rounded hover:bg-amber-900/30"
                    >
                      <span>{s.name}</span>
                      <span>₹{s.mrp}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isSearching && searchQuery.trim() && searchResults.length === 0 && substitutes.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm">
                No matching medicines found
              </div>
            )}
          </div>
        </section>

        {/* ── CENTER PANE: ACTIVE CART DATA-GRID (46%) ─────────────────────── */}
        <main className="w-[44%] flex flex-col bg-slate-950 border-r border-slate-800">
          <div className="p-3 border-b border-slate-800 bg-slate-900/70 flex justify-between items-center">
            <h2 className="font-bold text-sm text-slate-200">
              Active Cart ({cart.length} items)
            </h2>
            <button
              onClick={clearCart}
              className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
            >
              Clear [Ctrl+Del]
            </button>
          </div>

          {/* Cart Table Data-Grid */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
                <p className="text-sm">Cart is empty</p>
                <p className="text-xs text-slate-600">Scan a barcode or press F2 to search medicines</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase font-mono sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Item</th>
                    <th className="py-2.5 px-2">Unit</th>
                    <th className="py-2.5 px-2 text-center">Qty</th>
                    <th className="py-2.5 px-2 text-right">MRP</th>
                    <th className="py-2.5 px-2 text-right">Disc%</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                    <th className="py-2.5 px-2 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {cart.map(line => (
                    <tr key={line.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-2.5 px-3">
                        <p className="font-semibold text-white">{line.medicine_name}</p>
                        <div className="flex items-center space-x-1.5 text-[11px] text-slate-400">
                          {line.prescription_required && (
                            <span className="text-rose-400 font-mono">Rx</span>
                          )}
                          <span>GST {line.gst_rate}%</span>
                        </div>
                      </td>

                      <td className="py-2.5 px-2">
                        <select
                          value={line.unit_type}
                          onChange={e => updateLineUnit(line.id, e.target.value, line.conversion_factor)}
                          className="bg-slate-800 border border-slate-700 rounded text-slate-200 px-1 py-0.5 text-xs font-mono"
                        >
                          <option value="STRIP">Strip</option>
                          <option value="TABLET">Tablet</option>
                          <option value="BOX">Box</option>
                          <option value="BOTTLE">Bottle</option>
                        </select>
                      </td>

                      <td className="py-2.5 px-2">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => updateLineQuantity(line.id, line.quantity - 1)}
                            className="w-5 h-5 bg-slate-800 border border-slate-700 rounded text-slate-300 hover:bg-slate-700 flex items-center justify-center font-bold"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={e => updateLineQuantity(line.id, parseInt(e.target.value) || 1)}
                            className="w-10 text-center bg-slate-900 border border-slate-700 rounded py-0.5 text-white font-mono"
                          />
                          <button
                            onClick={() => updateLineQuantity(line.id, line.quantity + 1)}
                            className="w-5 h-5 bg-slate-800 border border-slate-700 rounded text-slate-300 hover:bg-slate-700 flex items-center justify-center font-bold"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      <td className="py-2.5 px-2 text-right font-mono text-slate-300">
                        ₹{line.mrp?.toFixed(2)}
                      </td>

                      <td className="py-2.5 px-2 text-right">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={line.discount_pct || 0}
                          onChange={e => updateLineDiscount(line.id, parseFloat(e.target.value) || 0)}
                          className="w-12 text-right bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-white font-mono text-xs"
                        />
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                        ₹{line.total?.toFixed(2)}
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        <button
                          onClick={() => removeLine(line.id)}
                          className="text-slate-500 hover:text-rose-400 text-sm"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Multi-Batch FEFO Allocation Info Bar */}
          {quote && quote.lines?.length > 0 && (
            <div className="p-2.5 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
              <span>FEFO Batch Compliance Active</span>
              <span className="font-mono">Taxable: ₹{quote.taxableAmount?.toFixed(2)} · GST: ₹{quote.totalGst?.toFixed(2)}</span>
            </div>
          )}
        </main>

        {/* ── RIGHT PANE: CUSTOMER, TOTALS & PAYMENTS (26%) ───────────────── */}
        <aside className="w-[26%] bg-slate-900/80 p-3 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-3">
            {/* Customer Lookup & Quick Info */}
            <div className="bg-slate-900 border border-slate-800 rounded p-2.5">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Customer [F3]
              </label>
              <input
                ref={customerInputRef}
                type="text"
                placeholder="Phone or Name (Walk-in)"
                value={customer_name}
                onChange={e => setCustomer(customer_id, e.target.value, customer_phone)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 font-mono"
              />
            </div>

            {/* Doctor & Prescription Information */}
            <div className="bg-slate-900 border border-slate-800 rounded p-2.5">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Doctor & Rx Info
              </label>
              <input
                type="text"
                placeholder="Doctor Name"
                value={doctor_name}
                onChange={e => setDoctor(e.target.value, doctor_registration_number)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 mb-1.5 font-mono"
              />
              <input
                type="text"
                placeholder="Prescription / Rx No."
                value={prescription_number}
                onChange={e => setPrescription(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 font-mono"
              />
            </div>

            {/* Coupon Code Voucher */}
            <div className="bg-slate-900 border border-slate-800 rounded p-2.5">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>Coupon Code</span>
                {quote?.couponDiscount > 0 && (
                  <span className="text-emerald-400 font-mono text-[10px] font-semibold">
                    Applied: -₹{quote.couponDiscount.toFixed(2)}
                  </span>
                )}
              </label>
              <input
                type="text"
                placeholder="Enter voucher (e.g. WELLNESS10)"
                value={coupon_code}
                onChange={e => setCouponCode(e.target.value.toUpperCase())}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 font-mono"
              />
            </div>

            {/* Loyalty Points Redemption */}
            {quote && (quote.availableLoyaltyCredits > 0 || quote.loyaltyCreditsEarnable > 0) && (
              <div className="bg-slate-900 border border-slate-800 rounded p-2.5">
                <div className="flex justify-between items-center text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  <span>Loyalty Rewards</span>
                  <span className="text-purple-400 font-mono text-[10px]">
                    Bal: {quote.availableLoyaltyCredits || 0} pts (₹{(quote.availableLoyaltyValuePaise || 0) / 100})
                  </span>
                </div>
                {quote.availableLoyaltyCredits > 0 ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max={quote.availableLoyaltyCredits}
                      placeholder="Redeem points"
                      value={redeem_loyalty_credits || ''}
                      onChange={e => setRedeemLoyaltyCredits(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono"
                    />
                    {quote.loyaltyRedeemed > 0 && (
                      <span className="text-purple-400 font-mono text-xs font-bold whitespace-nowrap">
                        -₹{quote.loyaltyRedeemed.toFixed(2)}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-400 font-mono">
                    Earns +{quote.loyaltyCreditsEarnable} credits on this sale
                  </div>
                )}
              </div>
            )}

            {/* Bill Discount Input */}
            <div className="bg-slate-900 border border-slate-800 rounded p-2.5">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Bill Discount (₹) [F5]
              </label>
              <input
                ref={discountInputRef}
                type="number"
                min="0"
                value={bill_discount}
                onChange={e => setBillDiscount(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* Totals Summary & Checkout CTA */}
          <div className="mt-4 bg-slate-900 border border-slate-800 rounded p-3 space-y-2">
            <div className="flex justify-between text-xs text-slate-400 font-mono">
              <span>MRP Total:</span>
              <span>₹{quote?.mrpTotal?.toFixed(2) || quote?.subtotal?.toFixed(2) || '0.00'}</span>
            </div>
            {quote?.promotionDiscount > 0 && (
              <div className="flex justify-between text-xs text-emerald-400 font-mono">
                <span>Promotions:</span>
                <span>-₹{quote.promotionDiscount.toFixed(2)}</span>
              </div>
            )}
            {quote?.couponDiscount > 0 && (
              <div className="flex justify-between text-xs text-amber-400 font-mono">
                <span>Coupon ({coupon_code}):</span>
                <span>-₹{quote.couponDiscount.toFixed(2)}</span>
              </div>
            )}
            {quote?.loyaltyRedeemed > 0 && (
              <div className="flex justify-between text-xs text-purple-400 font-mono">
                <span>Loyalty Points:</span>
                <span>-₹{quote.loyaltyRedeemed.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-slate-400 font-mono">
              <span>GST Total:</span>
              <span>₹{quote?.totalGst?.toFixed(2) || '0.00'}</span>
            </div>
            {quote?.totalSavings > 0 && (
              <div className="p-1.5 bg-emerald-950/60 border border-emerald-800/60 rounded text-center text-xs text-emerald-300 font-bold font-mono">
                Customer Saves: ₹{quote.totalSavings.toFixed(2)}
              </div>
            )}

            <div className="border-t border-slate-800 pt-2 flex justify-between items-baseline">
              <span className="font-bold text-sm text-white">GRAND TOTAL</span>
              <span className="font-bold text-2xl text-emerald-400 font-mono">
                {isQuoting ? '...' : `₹${quote?.grandTotal?.toFixed(2) || '0.00'}`}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsParkModalOpen(true)}
                disabled={cart.length === 0}
                className="text-xs"
              >
                Park [F6]
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  const res = await api.get('/pos/parked');
                  setParkedBills(res.data?.data || []);
                  setIsRecallModalOpen(true);
                }}
                className="text-xs"
              >
                Recall [F7]
              </Button>
            </div>

            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                setSplitCash(String(quote?.grandTotal || ''));
                setSplitUpi('');
                setSplitCard('');
                setSplitCredit('');
                setIsCheckoutModalOpen(true);
              }}
              disabled={cart.length === 0}
              className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold py-3 text-sm tracking-wide mt-2"
            >
              PAY & PRINT [F8]
            </Button>
          </div>
        </aside>
      </div>

      {/* ── SPLIT PAYMENT & CHECKOUT MODAL ─────────────────────────────────── */}
      {isCheckoutModalOpen && (
        <Modal
          isOpen={isCheckoutModalOpen}
          onClose={() => setIsCheckoutModalOpen(false)}
          title="Payment & Final Checkout"
        >
          <div className="space-y-4 text-slate-200">
            <div className="bg-slate-900 border border-slate-800 rounded p-3 text-center">
              <span className="text-xs text-slate-400 uppercase">Amount Due</span>
              <p className="text-3xl font-bold text-emerald-400 font-mono">
                ₹{quote?.grandTotal?.toFixed(2)}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Tenders Breakdown</label>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-xs text-slate-400">Cash (₹)</span>
                  <Input
                    type="number"
                    value={splitCash}
                    onChange={e => setSplitCash(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <span className="text-xs text-slate-400">UPI (₹)</span>
                  <Input
                    type="number"
                    value={splitUpi}
                    onChange={e => setSplitUpi(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <span className="text-xs text-slate-400">Card (₹)</span>
                  <Input
                    type="number"
                    value={splitCard}
                    onChange={e => setSplitCard(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <span className="text-xs text-slate-400">Credit / Due (₹)</span>
                  <Input
                    type="number"
                    value={splitCredit}
                    onChange={e => setSplitCredit(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {parseFloat(splitUpi) > 0 && (
                <div className="pt-1">
                  <span className="text-xs text-slate-400">UPI Ref / UTR</span>
                  <Input
                    type="text"
                    value={upiRefId}
                    onChange={e => setUpiRefId(e.target.value)}
                    placeholder="e.g. UPI12345678"
                  />
                </div>
              )}

              {parseFloat(splitCard) > 0 && (
                <div className="pt-1">
                  <span className="text-xs text-slate-400">Card Auth Code / Ref</span>
                  <Input
                    type="text"
                    value={cardRefNo}
                    onChange={e => setCardRefNo(e.target.value)}
                    placeholder="e.g. AUTH9876"
                  />
                </div>
              )}
            </div>

            {/* Dynamic UPI QR Display */}
            {parseFloat(splitUpi) > 0 && upiId && (
              <div className="flex flex-col items-center justify-center p-3 bg-white rounded">
                <QRCodeSVG
                  value={buildUpiPaymentUri({
                    vpa: upiId,
                    payeeName: shopName,
                    amount: parseFloat(splitUpi),
                  })}
                  size={140}
                />
                <span className="text-slate-900 text-xs font-mono mt-2">
                  Scan to pay ₹{splitUpi}
                </span>
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
              <Button variant="secondary" onClick={() => setIsCheckoutModalOpen(false)}>
                Cancel [Esc]
              </Button>
              <Button
                variant="primary"
                onClick={handleFinalCheckout}
                disabled={isCommitting}
                className="bg-emerald-600 hover:bg-emerald-500 font-bold"
              >
                {isCommitting ? 'Completing...' : 'Confirm Payment & Print [Enter]'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── PARK SALE MODAL ────────────────────────────────────────────────── */}
      {isParkModalOpen && (
        <Modal
          isOpen={isParkModalOpen}
          onClose={() => setIsParkModalOpen(false)}
          title="Park Active Sale (Hold)"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Holding this sale will generate a park token. You or another counter can resume it at any time.
            </p>
            <div className="flex justify-end space-x-2">
              <Button variant="secondary" onClick={() => setIsParkModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleParkSale}>
                Confirm Hold (F6)
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── RECALL PARKED BILL MODAL ────────────────────────────────────────── */}
      {isRecallModalOpen && (
        <Modal
          isOpen={isRecallModalOpen}
          onClose={() => setIsRecallModalOpen(false)}
          title="Recall Parked Bill [F7]"
        >
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {parkedBills.length === 0 ? (
              <p className="text-slate-500 text-center py-6 text-sm">No parked sales found in store</p>
            ) : (
              parkedBills.map(b => (
                <div
                  key={b.id}
                  onClick={() => handleResumeParked(b.id || b._local_id)}
                  className="p-3 bg-slate-900 border border-slate-800 rounded hover:border-emerald-500 cursor-pointer flex justify-between items-center"
                >
                  <div>
                    <span className="font-bold text-emerald-400 font-mono">#{b.park_token}</span>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {b.cart_snapshot?.length || 0} items · Cashier: {b.cashier_id}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm">
                    Resume
                  </Button>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}

      {/* ── RECEIPT & LAST BILL MODAL ───────────────────────────────────────── */}
      {isReceiptModalOpen && lastBillData && (
        <Modal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          title="Sale Completed — Tax Invoice"
        >
          <div className="space-y-4 text-slate-200">
            <div className="bg-slate-900 border border-slate-800 rounded p-3 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-emerald-400">INVOICE #{lastBillData?.sale?.invoice_number}</span>
                <Badge variant="success">PAID</Badge>
              </div>
              <p className="text-xs text-slate-400">Grand Total: ₹{lastBillData?.sale?.grand_total?.toFixed(2)}</p>
              {lastBillData?.change_returned > 0 && (
                <p className="text-xs text-amber-300">Change Returned: ₹{lastBillData.change_returned.toFixed(2)}</p>
              )}
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="secondary" onClick={() => setIsReceiptModalOpen(false)}>
                Close [Esc]
              </Button>
              <Button variant="primary" onClick={() => window.print()}>
                Print Receipt [F9]
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── RETURNS WORKFLOW MODAL ─────────────────────────────────────────── */}
      {isReturnsModalOpen && (
        <Modal
          isOpen={isReturnsModalOpen}
          onClose={() => setIsReturnsModalOpen(false)}
          title="Returns & Exchanges [F10]"
        >
          <div className="space-y-4 text-slate-200">
            <p className="text-xs text-slate-400">
              Scan invoice barcode or enter original invoice number to initiate a partial or full return.
            </p>
            <Input type="text" placeholder="Scan or enter Invoice Number..." />
            <div className="flex justify-end space-x-2">
              <Button variant="secondary" onClick={() => setIsReturnsModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary">
                Search Invoice
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── SUPERVISOR OVERRIDE MODAL ───────────────────────────────────────── */}
      {isSupervisorModalOpen && (
        <Modal
          isOpen={isSupervisorModalOpen}
          onClose={() => setIsSupervisorModalOpen(false)}
          title="Supervisor Manager Authorization"
        >
          <div className="space-y-4 text-slate-200">
            <p className="text-xs text-slate-400">
              Enter 4-digit Manager PIN to authorize restricted action (high discount, manual batch override, return).
            </p>
            <Input type="password" placeholder="Enter 4-digit PIN" maxLength={4} />
            <div className="flex justify-end space-x-2">
              <Button variant="secondary" onClick={() => setIsSupervisorModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary">
                Authorize Override
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
