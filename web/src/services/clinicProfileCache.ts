import api from '../lib/api';
import { sessionClient } from '../lib/sessionClient';

let cached: { scope: string; data: any; at: number } | undefined;
let loading: { scope: string; promise: Promise<any> } | undefined;
let generation = 0;
const scopeKey = () => `${generation}:${sessionClient.getVersion()}:${sessionClient.peekSession()?.user.id || ''}:${sessionStorage.getItem('impersonate_clinic_id') || ''}`;

/** Share header/UPI/receipt reads, without persisting one shop's data into another session. */
export function fetchClinicProfile(force = false): Promise<any> {
    const scope = scopeKey();
    if (!force && cached?.scope === scope && Date.now() - cached.at < 30_000)
        return Promise.resolve(cached.data);
    if (loading?.scope === scope) return loading.promise;
    const promise = api.get('/clinics/me').then(response => {
        const data = response.data?.data;
        if (data && scopeKey() === scope) cached = { scope, data, at: Date.now() };
        return data;
    });
    loading = { scope, promise };
    void promise.finally(() => { if (loading?.promise === promise) loading = undefined; }).catch(() => {});
    return promise;
}

export function clearClinicProfileCache() {
    generation++;
    cached = undefined;
    loading = undefined;
}
