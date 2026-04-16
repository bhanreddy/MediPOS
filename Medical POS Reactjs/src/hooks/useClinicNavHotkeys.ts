import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LOCAL_FKEYS_SELECTOR } from './useKeyboardShortcuts';

/**
 * Sidebar order: F1–F11 navigate; F12 opens New Invoice (`/billing/new`).
 * Skips when focus is in a form control or inside `[data-pos-local-fkeys]` (Purchase / Inventory).
 */
const CLINIC_F1_F11_PATHS = [
    '/dashboard',
    '/billing',
    '/purchases',
    '/inventory',
    '/customers',
    '/suppliers',
    '/expenses',
    '/reports',
    '/analytics',
    '/settings',
    '/settings/import',
] as const;

function isFormFieldTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function insideLocalFkeyZone(target: EventTarget | null): boolean {
    const el = target as HTMLElement | undefined;
    if (!el?.closest) return false;
    return !!el.closest(LOCAL_FKEYS_SELECTOR);
}

export function useClinicNavHotkeys(): void {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!/^F(1[0-2]|[1-9])$/.test(e.key)) return;
            if (e.repeat) return;
            if (isFormFieldTarget(e.target)) return;

            const local = insideLocalFkeyZone(e.target);
            const onPurchaseWorkflow = location.pathname.startsWith('/purchases/new');
            /** F12 = commit on purchase screen only; elsewhere F12 always opens new invoice. */
            if (local && !(e.key === 'F12' && !onPurchaseWorkflow)) return;

            const n = Number(e.key.slice(1));
            if (n >= 1 && n <= 11) {
                e.preventDefault();
                navigate(CLINIC_F1_F11_PATHS[n - 1]);
                return;
            }
            if (n === 12) {
                e.preventDefault();
                navigate('/billing/new');
            }
        };

        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [navigate, location.pathname]);
}
