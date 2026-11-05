// Synthetic browser QA. No production API requests or business data.
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AxiosError } from 'axios';
import { ClinicLayout } from '../../src/components/clinic/ClinicLayout';
import { InventoryScreen } from '../../src/components/Inventory/InventoryScreen';
import { useAuth } from '../../src/lib/auth';
import { queryClient } from '../../src/lib/queryClient';
import api from '../../src/lib/api';
import { inventoryDay, classifyInventory } from '../../src/services/inventoryRadarCore';
import '../../src/index.css';

const date = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return inventoryDay(d); };
const batch = (id: string, qty: number, days = 365) => ({ id, batch_number: id, quantity_remaining: qty, expiry_date: date(days), purchase_price: 2 });
const medicines = [
  { id: 'healthy', name: 'Healthy medicine', low_stock_threshold: 10, medicine_batches: [batch('H1', 6), batch('H2', 6)] },
  { id: 'overlap', name: 'Low and expiring medicine', low_stock_threshold: 10, medicine_batches: [batch('LOW-EXP', 2, 5)] },
  { id: 'empty', name: 'Out of stock medicine', low_stock_threshold: 10, medicine_batches: [] },
  { id: 'expired', name: 'Expired and healthy batches', low_stock_threshold: 10, medicine_batches: [batch('EXPIRED', 20, -1), batch('FUTURE', 20)] },
];
queryClient.setDefaultOptions({ queries: { retry: false } });
api.defaults.adapter = async config => {
  let data: unknown;
  switch (config.url) {
    case '/clinics/me': data = { id: 'qa-clinic', name: 'Synthetic inventory QA' }; break;
    case '/inventory/medicines': data = medicines; break;
    case '/inventory/batches/disposed': throw new AxiosError('Disposed history is unavailable in this test', 'ERR_BAD_RESPONSE', config, undefined, { data: {}, status: 503, statusText: 'Unavailable', headers: {}, config });
    case '/inventory/attention-counts': {
      const result = classifyInventory(medicines, config.params.today, config.params.warning);
      data = { low_stock: result.stats.criticalStock, expiring: result.stats.nearExpiry, shortbook: 1 };
      break;
    }
    case '/purchases': medicines[1].medicine_batches[0].quantity_remaining = 20; data = { id: 'synthetic-purchase' }; break;
    default: throw Error(`Unexpected QA request ${config.method} ${config.url}`);
  }
  return { data: { data }, status: 200, statusText: 'OK', headers: {}, config };
};
useAuth.setState({ isLoading: false, clinic_id: 'qa-clinic', isOwner: true, role: 'OWNER', user: { id: 'qa-owner', full_name: 'QA Owner', clinic_id: 'qa-clinic', role: 'OWNER' } });
window.history.replaceState(null, '', '/inventory');
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}><BrowserRouter>
    <div className="bg-warning/10 px-4 py-2 text-xs">Synthetic inventory / notification QA · <button onClick={() => void api.post('/purchases', {})}>Simulate restock</button></div>
    <Routes><Route element={<ClinicLayout />}>
      <Route path="/inventory" element={<InventoryScreen />} />
      <Route path="/shortbook" element={<h1>Reorder queue destination reached</h1>} />
    </Route></Routes>
  </BrowserRouter></QueryClientProvider>,
);
