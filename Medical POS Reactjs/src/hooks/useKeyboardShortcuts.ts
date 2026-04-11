import { useEffect, useCallback } from 'react';

type ShortcutAction = () => void;

interface ShortcutMap {
    [key: string]: ShortcutAction;
}

const F_KEYS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'] as const;

/** Purchase / Inventory bind F6 & F12 locally; wrap their root with `data-pos-local-fkeys="true"`. */
export const LOCAL_FKEYS_SELECTOR = '[data-pos-local-fkeys="true"]';

function targetInsideLocalFkeyZone(target: EventTarget | null): boolean {
    const el = target as HTMLElement | undefined;
    if (!el?.closest) return false;
    return !!el.closest(LOCAL_FKEYS_SELECTOR);
}

/**
 * Global POS shortcuts: F1–F12 navigation, Ctrl+K. F-keys do not steal focus when inside `[data-pos-local-fkeys]`.
 */
export const useKeyboardShortcuts = (shortcuts: ShortcutMap) => {
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        const local = targetInsideLocalFkeyZone(event.target);
        const isF = F_KEYS.includes(event.key as (typeof F_KEYS)[number]);

        if (isF) {
            if (local) return;
            event.preventDefault();
        }

        if (event.ctrlKey && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            shortcuts['Ctrl+K']?.();
            return;
        }

        if (shortcuts[event.key]) {
            if (isF && local) return;
            shortcuts[event.key]();
        }
    }, [shortcuts]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
};

/**
 * Focus management utilities for POS
 */
export const useTabTrap = (ref: React.RefObject<HTMLElement | null>, active: boolean) => {
    useEffect(() => {
        if (!active || !ref.current) return;

        const focusableElements = ref.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        const handleTab = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;

            if (e.shiftKey) {
                if (document.activeElement === firstElement) {
                    lastElement.focus();
                    e.preventDefault();
                }
            } else {
                if (document.activeElement === lastElement) {
                    firstElement.focus();
                    e.preventDefault();
                }
            }
        };

        window.addEventListener('keydown', handleTab);
        return () => window.removeEventListener('keydown', handleTab);
    }, [ref, active]);
};
