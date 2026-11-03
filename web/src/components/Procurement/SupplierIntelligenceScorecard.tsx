import React, { useState, useEffect } from 'react';
import api from '../../lib/api';

export const SupplierIntelligenceScorecard: React.FC = () => {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [scorecard, setScorecard] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchSuppliers = async () => {
    try {
      const res = await api.get('/suppliers');
      if (res.data?.data) {
        setSuppliers(res.data.data);
        if (res.data.data.length > 0) {
          setSelectedSupplierId(res.data.data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load suppliers:', err);
    }
  };

  const fetchScorecard = async (suppId: string) => {
    if (!suppId) return;
    setIsLoading(true);
    try {
      const res = await api.get(`/procurement/supplier-scorecard?supplier_id=${suppId}`);
      if (res.data?.data) {
        setScorecard(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load supplier scorecard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  useEffect(() => {
    if (selectedSupplierId) {
      fetchScorecard(selectedSupplierId);
    }
  }, [selectedSupplierId]);

  const formatRupees = (paise: number) => {
    return `₹${((paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* TOOLBAR */}
      <div className="flex justify-between items-center bg-surface-elevated/60 p-3 rounded-lg border border-border">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground-strong">
            Supplier Intelligence & Component-Based Scorecard
          </h2>
          {isLoading && <span className="text-xs text-warning font-semibold animate-pulse">Calculating Score...</span>}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedSupplierId}
            onChange={(e) => setSelectedSupplierId(e.target.value)}
            className="bg-surface border border-border rounded p-1.5 text-xs text-foreground-strong"
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {scorecard ? (
        <div className="space-y-6">
          {/* HEADER SUMMARY CARD */}
          <div className="p-5 bg-surface-elevated/60 rounded-xl border border-border flex justify-between items-center">
            <div>
              <div className="text-xs uppercase font-semibold text-muted">Supplier Performance Scorecard</div>
              <div className="text-2xl font-black text-foreground-strong mt-1">{scorecard.supplierName}</div>
              <div className="text-xs text-muted mt-1">
                Total Orders: <strong className="text-foreground-strong">{scorecard.totalOrders}</strong> | Lifetime Purchase Value:{' '}
                <strong className="text-success">{formatRupees(scorecard.totalPurchaseValuePaise)}</strong>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-xs text-muted uppercase font-semibold">Composite Score</div>
                <div className="text-3xl font-black text-success font-mono">{scorecard.overallScore} / 100</div>
              </div>
              <div
                className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-black border ${
                  scorecard.ratingGrade === 'A+' || scorecard.ratingGrade === 'A'
                    ? 'bg-success/8 text-success border-success/25'
                    : scorecard.ratingGrade === 'B'
                    ? 'bg-info/8 text-info border-info/25'
                    : 'bg-warning/8 text-warning border-warning/25'
                }`}
              >
                {scorecard.ratingGrade}
              </div>
            </div>
          </div>

          {/* 6 COMPONENT SCORE BREAKDOWN */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. LEAD TIME */}
            <div className="p-4 bg-surface-elevated/40 rounded-xl border border-border space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-foreground uppercase">Lead Time Reliability</span>
                <span className="font-mono font-bold text-success">{scorecard.scoreBreakdown?.leadTimeScore} / 20 pts</span>
              </div>
              <div className="text-2xl font-black text-foreground-strong">{scorecard.observedAvgLeadTimeDays} days</div>
              <div className="text-xs text-muted">
                Configured: {scorecard.configuredLeadTimeDays} days | On-Time Rate:{' '}
                <strong className="text-foreground-strong">{scorecard.onTimeDeliveryRatePct}%</strong>
              </div>
            </div>

            {/* 2. FILL RATE */}
            <div className="p-4 bg-surface-elevated/40 rounded-xl border border-border space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-foreground uppercase">Order Fill Rate</span>
                <span className="font-mono font-bold text-success">{scorecard.scoreBreakdown?.fillRateScore} / 20 pts</span>
              </div>
              <div className="text-2xl font-black text-foreground-strong">{scorecard.fillRatePct}%</div>
              <div className="text-xs text-muted">
                Short Delivery: {scorecard.shortDeliveryRatePct}% | Excess: {scorecard.excessDeliveryRatePct}%
              </div>
            </div>

            {/* 3. QUALITY & DAMAGE */}
            <div className="p-4 bg-surface-elevated/40 rounded-xl border border-border space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-foreground uppercase">Quality & Inspection</span>
                <span className="font-mono font-bold text-success">{scorecard.scoreBreakdown?.qualityScore} / 20 pts</span>
              </div>
              <div className="text-2xl font-black text-foreground-strong">
                {(100 - (scorecard.rejectionRatePct + scorecard.damagedReceiptRatePct)).toFixed(1)}%
              </div>
              <div className="text-xs text-muted">
                Rejections: {scorecard.rejectionRatePct}% | Damaged: {scorecard.damagedReceiptRatePct}%
              </div>
            </div>

            {/* 4. SCHEME HONOURING */}
            <div className="p-4 bg-surface-elevated/40 rounded-xl border border-border space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-foreground uppercase">Scheme Honouring</span>
                <span className="font-mono font-bold text-success">{scorecard.scoreBreakdown?.schemeScore} / 10 pts</span>
              </div>
              <div className="text-2xl font-black text-foreground-strong">{scorecard.schemeFulfilmentRatePct}%</div>
              <div className="text-xs text-muted">Actual free units delivered vs contracted commercial terms</div>
            </div>

            {/* 5. INVOICE ACCURACY */}
            <div className="p-4 bg-surface-elevated/40 rounded-xl border border-border space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-foreground uppercase">Invoice Accuracy</span>
                <span className="font-mono font-bold text-success">{scorecard.scoreBreakdown?.invoiceAccuracyScore} / 10 pts</span>
              </div>
              <div className="text-2xl font-black text-foreground-strong">{(100 - scorecard.invoiceMismatchRatePct).toFixed(1)}%</div>
              <div className="text-xs text-muted">3-way matching rate without price or quantity disputes</div>
            </div>

            {/* 6. PRICE COMPETITIVENESS */}
            <div className="p-4 bg-surface-elevated/40 rounded-xl border border-border space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-foreground uppercase">Price Stability</span>
                <span className="font-mono font-bold text-success">{scorecard.scoreBreakdown?.priceScore} / 20 pts</span>
              </div>
              <div className="text-2xl font-black text-foreground-strong">Optimal</div>
              <div className="text-xs text-muted">Effective acquisition cost consistency across orders</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center text-muted text-xs">
          Select a supplier to compute performance intelligence scorecard.
        </div>
      )}
    </div>
  );
};
