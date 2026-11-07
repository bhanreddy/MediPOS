import api from '../lib/api';

/** Read the full catalogue in bounded requests so large branches do not build one large response. */
export async function loadInventoryCatalogue(signal?: AbortSignal) {
    const medicines: any[] = [];
    let cursor: string | undefined;
    do {
        const { data } = await api.get('/inventory/medicines', {
            params: { page_size: 250, after: cursor },
            signal,
        });
        medicines.push(...(data?.data ?? data ?? []));
        const next = data?.next_cursor;
        if (next && cursor && next <= cursor) throw new Error('Inventory catalogue cursor did not advance.');
        cursor = next || undefined;
    } while (cursor);
    return medicines;
}
