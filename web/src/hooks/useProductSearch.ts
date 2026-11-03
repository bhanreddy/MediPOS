import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { mapMedicineSearchResult, filterSearchResults, type SearchResult } from '../services/productLookupService';

export type { SearchResult };
export const BILLING_SEARCH_KEY = 'billing-product-search';

export const useProductSearch = (query: string) => {
    const trimmed = query.trim().toLowerCase();
    const [debounced, setDebounced] = useState(trimmed);
    const clinicId = useAuth(state => state.clinic_id);
    const userId = useAuth(state => state.user?.id);
    const scope = sessionStorage.getItem('impersonate_clinic_id') || clinicId;
    const client = useQueryClient();
    const key = (term: string) => [BILLING_SEARCH_KEY, userId, scope, term];

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(trimmed), 80);
        return () => clearTimeout(timer);
    }, [trimmed]);

    const search = useQuery<SearchResult[]>({
        queryKey: key(debounced),
        enabled: debounced.length >= 2 && !!userId,
        staleTime: 15_000,
        gcTime: 60_000,
        retry: false,
        refetchOnWindowFocus: false,
        queryFn: async ({ signal }) => {
            const barcode = /^\d{3,}$/.test(debounced);
            const response = await api.get('/inventory/medicines/search', {
                params: { ...(barcode ? { barcode: debounced } : { q: debounced }), limit: 25, include_substitutes: false },
                signal,
            });
            const today = new Date().toISOString().split('T')[0];
            const mapped: SearchResult[] = (response.data?.results || [])
                .map((medicine: any) => mapMedicineSearchResult(medicine, false, today));
            // Preserve the API's exact/prefix ranking within each stock group.
            return mapped.sort((a, b) => Number(b.totalStock > 0) - Number(a.totalStock > 0));
        },
        placeholderData: (previous, previousQuery) => {
            if (previousQuery?.queryKey[1] !== userId || previousQuery?.queryKey[2] !== scope) return undefined;
            return filterSearchResults(previous || [], debounced);
        },
    });

    const exact = client.getQueryData<SearchResult[]>(key(trimmed));
    const results = trimmed.length < 2 ? [] : exact || filterSearchResults(search.data || [], trimmed);
    return {
        results,
        isSearching: trimmed.length >= 2 && (trimmed !== debounced || search.isFetching),
        error: trimmed === debounced && search.isError ? 'Unable to search medicines. Please try again.' : '',
    };
};
