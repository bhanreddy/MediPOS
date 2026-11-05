// Isolated browser QA: synthetic inventory and an in-memory API; no business data is changed.
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AxiosError } from 'axios';
import { InventoryScreen } from '../../src/components/Inventory/InventoryScreen';
import { useAuth } from '../../src/lib/auth';
import { queryClient } from '../../src/lib/queryClient';
import api from '../../src/lib/api';
import '../../src/index.css';

const batch = (id: string, quantity: number) => ({ id, batch_number: id, quantity_remaining: quantity, expiry_date: '2099-12-31', purchase_price: 2 });
let medicines = [
    { id: 'medicine-with-two-batches', name: 'Sample medicine', medicine_batches: [batch('BATCH-ONE', 12), batch('BATCH-TWO', 15)] },
    { id: 'empty-medicine', name: 'Out of stock medicine', medicine_batches: [] },
];
export const qa = { deleteRequests: [] as string[], failNext: false, pending: false, release: () => {} };
queryClient.setDefaultOptions({ queries: { retry: false } });
queryClient.setQueryData(['billing-product-search', 'qa-owner', 'qa-clinic', 'sample'], []);
api.defaults.adapter = async config => {
    let data: unknown;
    if (config.method === 'delete') {
        qa.deleteRequests.push(config.url!);
        if (qa.pending) await new Promise<void>(resolve => { qa.release = resolve; });
        if (qa.failNext) {
            qa.failNext = false;
            throw new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, undefined, {
                data: { error: { message: 'Synthetic deletion failure' } }, status: 500, statusText: 'Error', headers: {}, config,
            });
        }
        medicines = medicines.filter(medicine => config.url !== `/inventory/medicines/${medicine.id}`);
        data = { deleted: true };
    } else if (config.url === '/inventory/medicines') {
        data = medicines;
    } else if (config.url === '/inventory/batches/disposed') {
        data = [];
    } else if (config.url?.startsWith('/settings')) {
        data = {};
    } else {
        throw Error(`Unexpected QA request ${config.method} ${config.url}`);
    }
    return { data: { data }, status: 200, statusText: 'OK', headers: {}, config };
};
useAuth.setState({ isLoading: false, clinic_id: 'qa-clinic', isOwner: true, role: 'OWNER', user: { id: 'qa-owner', clinic_id: 'qa-clinic', role: 'OWNER' } });
createRoot(document.getElementById('root')!).render(
    <QueryClientProvider client={queryClient}><BrowserRouter>
        <main className="bg-background min-h-screen p-4"><InventoryScreen /></main><Toaster />
    </BrowserRouter></QueryClientProvider>,
);
