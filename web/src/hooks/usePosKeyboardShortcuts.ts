import { useEffect } from 'react';

export interface PosKeyboardShortcutHandlers {
  onSearchFocus?: () => void;      // F2
  onCustomerFocus?: () => void;    // F3
  onQuantityFocus?: () => void;    // F4
  onDiscountFocus?: () => void;    // F5
  onParkSale?: () => void;         // F6
  onRecallSale?: () => void;       // F7
  onCheckout?: () => void;         // F8
  onPrintLastBill?: () => void;    // F9
  onReturns?: () => void;          // F10
  onClearCart?: () => void;        // Ctrl + Delete / Command + Backspace
  onEscape?: () => void;           // Escape
}

export function usePosKeyboardShortcuts(handlers: PosKeyboardShortcutHandlers, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'F2':
          e.preventDefault();
          handlers.onSearchFocus?.();
          break;

        case 'F3':
          e.preventDefault();
          handlers.onCustomerFocus?.();
          break;

        case 'F4':
          e.preventDefault();
          handlers.onQuantityFocus?.();
          break;

        case 'F5':
          e.preventDefault();
          handlers.onDiscountFocus?.();
          break;

        case 'F6':
          e.preventDefault();
          handlers.onParkSale?.();
          break;

        case 'F7':
          e.preventDefault();
          handlers.onRecallSale?.();
          break;

        case 'F8':
          e.preventDefault();
          handlers.onCheckout?.();
          break;

        case 'F9':
          e.preventDefault();
          handlers.onPrintLastBill?.();
          break;

        case 'F10':
          e.preventDefault();
          handlers.onReturns?.();
          break;

        case 'Delete':
        case 'Backspace':
          if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
            e.preventDefault();
            handlers.onClearCart?.();
          }
          break;

        case 'Escape':
          handlers.onEscape?.();
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers, enabled]);
}
