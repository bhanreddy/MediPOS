import React, { useState, useEffect } from 'react';
import { 
  ClipboardCheck, 
  Plus, 
  Play, 
  Check, 
  CheckCircle2,
  FileCheck2,
  RefreshCw,
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export const StocktakePage: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [sessionItems, setSessionItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form State
  const [sessionName, setSessionName] = useState('');
  const [sessionType, setSessionType] = useState('FULL');
  const [countingMode, setCountingMode] = useState('LIVE_COUNT');
  const [isBlindCount, setIsBlindCount] = useState(false);
  const [isDoubleCount, setIsDoubleCount] = useState(false);

  // Barcode Scanner Form State
  const [barcodeInput, setBarcodeInput] = useState('');
  const [countQty, setCountQty] = useState(1);
  const [selectedMedicineId, setSelectedMedicineId] = useState('');

  const loadSessions = async () => {
    try {
      setLoading(true);
      const res = await api.get('/inventory/stocktakes');
      setSessions(res.data?.data || []);
    } catch (err: any) {
      toast.error('Failed to load stocktake sessions');
    } finally {
      setLoading(false);
    }
  };

  const loadSessionDetails = async (id: string) => {
    try {
      setLoading(true);
      const res = await api.get(`/inventory/stocktakes/${id}`);
      setSelectedSession(res.data?.data?.session);
      setSessionItems(res.data?.data?.items || []);
    } catch (err: any) {
      toast.error('Failed to load session details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/inventory/stocktakes', {
        name: sessionName || `Stocktake ${new Date().toISOString().split('T')[0]}`,
        type: sessionType,
        countingMode,
        isBlindCount,
        isDoubleCount,
      });
      toast.success('Stocktake session created');
      setShowCreateModal(false);
      loadSessions();
      if (res.data?.data?.id) {
        loadSessionDetails(res.data.data.id);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to create session');
    }
  };

  const handleStartSession = async () => {
    if (!selectedSession) return;
    try {
      await api.post(`/inventory/stocktakes/${selectedSession.id}/start`);
      toast.success('Stocktake started — Inventory snapshot captured!');
      loadSessionDetails(selectedSession.id);
      loadSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to start session');
    }
  };

  const handleRecordScanCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession || !selectedMedicineId) {
      toast.error('Select a medicine to record count');
      return;
    }

    try {
      await api.post(`/inventory/stocktakes/${selectedSession.id}/count`, {
        medicineId: selectedMedicineId,
        scannedBarcode: barcodeInput,
        rawQuantity: countQty,
      });
      toast.success('Count logged!');
      setBarcodeInput('');
      setCountQty(1);
      loadSessionDetails(selectedSession.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to record count');
    }
  };

  const handleApproveSession = async () => {
    if (!selectedSession) return;
    try {
      await api.post(`/inventory/stocktakes/${selectedSession.id}/approve`, {});
      toast.success('Stocktake session APPROVED!');
      loadSessionDetails(selectedSession.id);
      loadSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to approve session');
    }
  };

  const handlePostAdjustments = async () => {
    if (!selectedSession) return;
    try {
      const res = await api.post(`/inventory/stocktakes/${selectedSession.id}/post`, {});
      toast.success(`Adjustments POSTED to ledger! (${res.data?.data?.postedMovementsCount || 0} movements)`);
      loadSessionDetails(selectedSession.id);
      loadSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to post adjustments');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-bg-surface p-5 rounded-xl border border-border">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-accent-primary" />
            Stocktake
          </h1>
          <p className="text-xs text-muted mt-1">
            Count physical stock, review differences, and approve adjustments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSessions}
            className="flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg border border-border hover:bg-bg-card text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-foreground-strong text-xs font-bold rounded-lg hover:bg-accent-primary/90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Stocktake Session
          </button>
        </div>
      </div>

      {/* Main Grid: Sessions List (Left 30%) & Active Workspace (Right 70%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sessions List */}
        <div className="lg:col-span-4 bg-bg-surface rounded-xl border border-border p-4 space-y-3">
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider">Stocktake Sessions</h2>
          {sessions.length === 0 ? (
            <p className="text-xs text-muted py-6 text-center">No stocktake sessions created yet.</p>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
              {sessions.map((s) => {
                const isSelected = selectedSession?.id === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => loadSessionDetails(s.id)}
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition-colors space-y-1.5 ${
                      isSelected
                        ? 'border-accent-primary bg-accent-primary/10'
                        : 'border-border bg-bg-card hover:bg-bg-card/80'
                    }`}
                  >
                    <div className="flex justify-between items-center font-bold">
                      <span className="text-foreground truncate">{s.name}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        s.status === 'POSTED'
                          ? 'bg-success/10 text-success border border-success/30'
                          : s.status === 'APPROVED'
                          ? 'bg-info/10 text-info border border-info/30'
                          : s.status === 'IN_PROGRESS'
                          ? 'bg-warning/10 text-warning border border-warning/30'
                          : 'bg-surface-alt/10 text-muted border border-border/30'
                      }`}>
                        {s.status}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-muted">
                      <span>{s.type} · {s.counting_mode}</span>
                      <span>{new Date(s.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Active Workspace */}
        <div className="lg:col-span-8 bg-bg-surface rounded-xl border border-border p-5 space-y-4">
          {!selectedSession ? (
            <div className="py-20 text-center text-muted text-xs">
              Select or create a stocktake session to view counting details and variance review.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Session Details Top Bar */}
              <div className="flex flex-wrap justify-between items-center gap-3 pb-4 border-b border-border">
                <div>
                  <h2 className="text-base font-bold text-foreground">{selectedSession.name}</h2>
                  <div className="flex items-center gap-3 text-xs text-muted mt-1">
                    <span>Mode: <strong className="text-foreground">{selectedSession.counting_mode}</strong></span>
                    <span>Type: <strong className="text-foreground">{selectedSession.type}</strong></span>
                    <span>Blind Count: <strong className="text-foreground">{selectedSession.is_blind_count ? 'Yes' : 'No'}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedSession.status === 'DRAFT' && (
                    <button
                      onClick={handleStartSession}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-success text-on-primary text-xs font-bold rounded-lg hover:bg-success"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Start Counting
                    </button>
                  )}

                  {selectedSession.status === 'IN_PROGRESS' && (
                    <button
                      onClick={handleApproveSession}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-info text-on-primary text-xs font-bold rounded-lg hover:bg-info"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Approve Variances
                    </button>
                  )}

                  {selectedSession.status === 'APPROVED' && (
                    <button
                      onClick={handlePostAdjustments}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-primary text-foreground-strong text-xs font-bold rounded-lg hover:bg-accent-primary/90"
                    >
                      <FileCheck2 className="w-3.5 h-3.5" />
                      Post Adjustments to Ledger
                    </button>
                  )}

                  {selectedSession.status === 'POSTED' && (
                    <span className="flex items-center gap-1 text-xs font-bold text-success bg-success/10 px-3 py-1.5 rounded-lg border border-success/30">
                      <CheckCircle2 className="w-4 h-4" />
                      Adjustments Finalized
                    </span>
                  )}
                </div>
              </div>

              {/* Barcode & Physical Count Input Bar (Only when IN_PROGRESS) */}
              {selectedSession.status === 'IN_PROGRESS' && (
                <form onSubmit={handleRecordScanCount} className="p-3.5 bg-bg-card rounded-lg border border-border flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-[10px] uppercase font-bold text-muted block mb-1">Select Medicine</label>
                    <select
                      value={selectedMedicineId}
                      onChange={(e) => setSelectedMedicineId(e.target.value)}
                      className="w-full bg-bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none"
                    >
                      <option value="">-- Choose Medicine to Count --</option>
                      {sessionItems.map((it) => (
                        <option key={it.medicine_id} value={it.medicine_id}>
                          {it.medicine_name} {it.batch_number ? `(Batch #${it.batch_number})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-32">
                    <label className="text-[10px] uppercase font-bold text-muted block mb-1">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={countQty}
                      onChange={(e) => setCountQty(parseInt(e.target.value) || 1)}
                      className="w-full bg-bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground font-mono focus:outline-none"
                    />
                  </div>

                  <div className="self-end">
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-accent-primary text-foreground-strong text-xs font-bold rounded-lg hover:bg-accent-primary/90 transition-colors"
                    >
                      + Log Count
                    </button>
                  </div>
                </form>
              )}

              {/* Variance Review Table */}
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs text-foreground">
                  <thead className="bg-bg-card border-b border-border text-[11px] font-bold text-muted uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Medicine & Batch</th>
                      <th className="py-2.5 px-3 text-right">Expected</th>
                      <th className="py-2.5 px-3 text-right">Physical Count</th>
                      <th className="py-2.5 px-3 text-right">Variance</th>
                      <th className="py-2.5 px-3 text-right">Value Delta (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sessionItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-muted">
                          No snapshot items found. Click "Start Counting" to capture snapshot.
                        </td>
                      </tr>
                    ) : (
                      sessionItems.map((it) => {
                        const diff = Number(it.difference || 0);
                        const valDiff = Number(it.value_difference_paise || 0) / 100;
                        return (
                          <tr key={it.id} className="hover:bg-bg-card/40">
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-foreground">{it.medicine_name}</div>
                              <div className="text-[10px] text-muted">Batch: {it.batch_number || 'N/A'} · Exp: {it.expiry_date || 'N/A'}</div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-muted">
                              {it.expected_quantity}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">
                              {it.physical_quantity}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold">
                              <span className={diff < 0 ? 'text-danger' : diff > 0 ? 'text-success' : 'text-muted'}>
                                {diff > 0 ? `+${diff}` : diff}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold">
                              <span className={valDiff < 0 ? 'text-danger' : valDiff > 0 ? 'text-success' : 'text-muted'}>
                                ₹{valDiff.toFixed(2)}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Session Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60  z-50 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-foreground">Create Stocktake Session</h2>
            <form onSubmit={handleCreateSession} className="space-y-3 text-xs">
              <div>
                <label className="text-muted block mb-1">Session Name</label>
                <input
                  type="text"
                  placeholder="e.g. Q3 Full Pharmacy Stocktake"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-muted block mb-1">Stocktake Scope / Type</label>
                <select
                  value={sessionType}
                  onChange={(e) => setSessionType(e.target.value)}
                  className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none"
                >
                  <option value="FULL">FULL (Entire Pharmacy)</option>
                  <option value="CYCLE_COUNT">CYCLE_COUNT (High Value / Fast Moving)</option>
                  <option value="CATEGORY">CATEGORY (Specific Category)</option>
                  <option value="EXPIRY">EXPIRY (Near Expiry SKUs)</option>
                </select>
              </div>

              <div>
                <label className="text-muted block mb-1">Counting Mode</label>
                <select
                  value={countingMode}
                  onChange={(e) => setCountingMode(e.target.value)}
                  className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none"
                >
                  <option value="LIVE_COUNT">LIVE_COUNT (Billing Continues with Movement Reconciliation)</option>
                  <option value="HARD_FREEZE">HARD_FREEZE (Billing Blocked during count)</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="blindCount"
                  checked={isBlindCount}
                  onChange={(e) => setIsBlindCount(e.target.checked)}
                  className="rounded border-border"
                />
                <label htmlFor="blindCount" className="text-foreground">Blind Count (Hide expected quantities from staff)</label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="doubleCount"
                  checked={isDoubleCount}
                  onChange={(e) => setIsDoubleCount(e.target.checked)}
                  className="rounded border-border"
                />
                <label htmlFor="doubleCount" className="text-foreground">Double Count (Two independent counters required)</label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 text-muted hover:text-foreground font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-accent-primary text-foreground-strong font-bold rounded-lg hover:bg-accent-primary/90"
                >
                  Create Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
