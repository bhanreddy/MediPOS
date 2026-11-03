import { useEffect, useState } from 'react';

export interface FestivalPoster {
    id: string;
    title: string;
    image_url: string | null;
    ends_at: string;
}

const SUPERADMIN_API_URL =
    (import.meta.env.VITE_SUPERADMIN_API_URL as string | undefined)?.trim() ||
    'https://superadminbackend-8ulw.onrender.com';

const seenKey = (userId: string, posterId: string) => `festival_poster_seen:${userId}:${posterId}`;

/**
 * Fetches the active festival poster (uploaded from the SuperAdmin app) and
 * shows it at most once per user per poster. Fail-silent: any error means
 * no popup, never a broken dashboard.
 */
export function useFestivalPoster(userId: string | null | undefined) {
    const [poster, setPoster] = useState<FestivalPoster | null>(null);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;

        (async () => {
            try {
                const res = await fetch(`${SUPERADMIN_API_URL}/api/public/festival-poster?app=medipos`);
                if (!res.ok) return;
                const body = await res.json();
                const p: FestivalPoster | null = body?.poster ?? null;
                if (!p || !p.image_url || cancelled) return;
                if (localStorage.getItem(seenKey(userId, p.id))) return;
                // Mark seen at show-time so a reload can't re-show it.
                localStorage.setItem(seenKey(userId, p.id), new Date().toISOString());
                setPoster(p);
            } catch {
                // Silent: poster popup must never affect the dashboard.
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [userId]);

    return { poster, dismiss: () => setPoster(null) };
}
