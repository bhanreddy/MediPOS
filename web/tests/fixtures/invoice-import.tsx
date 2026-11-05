// Isolated browser fixture: all API calls are handled here, never sent to a real account.
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { PurchaseScreen } from '../../src/components/Purchase/PurchaseScreen';
import { useAuth } from '../../src/lib/auth';
import { queryClient } from '../../src/lib/queryClient';
import { sessionClient } from '../../src/lib/sessionClient';
import api from '../../src/lib/api';
import '../../src/index.css';

const medicine = { id: '11111111-1111-4111-8111-111111111111', name: 'Paracetamol 500mg', generic_name: 'Paracetamol', manufacturer: 'QA Manufacturer', gst_rate: 12, pack_size: '10 tablets', base_unit: 'strip', is_active: true };
const purchases: unknown[] = [];
Object.assign(window, { invoiceTestPurchases: purchases });
sessionClient.getSession = async () => null;
queryClient.setDefaultOptions({ queries: { retry: false } });
api.defaults.adapter = async config => {
  let data: unknown;
  switch (config.url) {
    case '/suppliers': data = [{ id: '22222222-2222-4222-8222-222222222222', name: 'QA Supplier', is_active: true }]; break;
    case '/purchases/invoice-matches': data = [medicine]; break;
    case '/inventory/medicines/search': return { data: { results: [medicine] }, status: 200, statusText: 'OK', headers: {}, config };
    case '/purchases': purchases.push(JSON.parse(config.data)); data = { id: 'qa-purchase' }; break;
    default: throw Error(`Unexpected QA request ${config.method} ${config.url}`);
  }
  return { data: { data }, status: 200, statusText: 'OK', headers: {}, config };
};
useAuth.setState({ isLoading: false, clinic_id: 'qa-invoice', isOwner: true, role: 'OWNER', user: { id: 'qa-owner', clinic_id: 'qa-invoice', role: 'OWNER' } });
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><BrowserRouter><main className="min-h-screen bg-background p-4 md:p-8"><PurchaseScreen /></main></BrowserRouter></QueryClientProvider>);
