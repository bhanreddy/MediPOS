import { useEffect, useReducer, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Delete, GripHorizontal, X } from 'lucide-react';
import { calculatorReducer, initialCalculatorState } from '../../utils/calculator';

interface FloatingCalculatorProps {
    onClose: () => void;
}

const keys = ['AC', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', 'backspace', '0', '.', '='];
const labels: Record<string, string> = {
    AC: 'Clear calculator', '±': 'Change sign', '%': 'Percent', '÷': 'Divide',
    '×': 'Multiply', '-': 'Subtract', '+': 'Add', backspace: 'Backspace', '.': 'Decimal point', '=': 'Equals',
};

export function FloatingCalculator({ onClose }: FloatingCalculatorProps) {
    const [state, dispatch] = useReducer(calculatorReducer, initialCalculatorState);
    const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState(false);
    const panelRef = useRef<HTMLElement>(null);
    const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

    useEffect(() => { panelRef.current?.focus(); }, []);
    useEffect(() => {
        const keepVisible = () => setPosition(previous => {
            const panel = panelRef.current;
            if (!previous || !panel) return previous;
            return {
                left: Math.max(16, Math.min(previous.left, window.innerWidth - panel.offsetWidth - 16)),
                top: Math.max(16, Math.min(previous.top, window.innerHeight - panel.offsetHeight - 16)),
            };
        });
        window.addEventListener('resize', keepVisible);
        return () => window.removeEventListener('resize', keepVisible);
    }, []);

    const pressKey = (key: string) => {
        dispatch(key);
        setCopied(false);
        setCopyError(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.key === 'Tab') return;
        // Keep Enter available for the close and copy buttons.
        const targetButton = (event.target as HTMLElement).closest('button');
        if (event.key === 'Enter' && targetButton && !targetButton.hasAttribute('data-calculator-key')) return;
        const key = ({ Enter: '=', Escape: 'close', Backspace: 'backspace', Delete: 'AC', c: 'AC', C: 'AC', '*': '×', '/': '÷' } as Record<string, string>)[event.key] ?? event.key;
        if (key === 'close' || keys.includes(key) || /^[0-9]$/.test(key)) {
            event.preventDefault();
            event.stopPropagation();
            if (key === 'close') onClose();
            else pressKey(key);
        }
    };

    const startDrag = (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
        const bounds = panelRef.current?.getBoundingClientRect();
        if (!bounds) return;
        dragRef.current = { x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const moveDrag = (event: PointerEvent<HTMLElement>) => {
        const drag = dragRef.current;
        const panel = panelRef.current;
        if (!drag || !panel) return;
        setPosition({
            left: Math.max(16, Math.min(drag.left + event.clientX - drag.x, window.innerWidth - panel.offsetWidth - 16)),
            top: Math.max(16, Math.min(drag.top + event.clientY - drag.y, window.innerHeight - panel.offsetHeight - 16)),
        });
    };

    const copyResult = async () => {
        try {
            await navigator.clipboard.writeText(state.display);
            setCopied(true);
            setCopyError(false);
        } catch {
            setCopyError(true);
        }
    };

    return createPortal(
        <section
            id="stock-calculator"
            ref={panelRef}
            role="region"
            aria-label="Stock calculator"
            tabIndex={-1}
            onKeyDownCapture={handleKeyDown}
            className="fixed bottom-4 right-4 z-[60] w-72 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-border bg-surface text-foreground shadow-2xl outline-none"
            style={position ? { left: position.left, top: position.top, right: 'auto', bottom: 'auto' } : undefined}
        >
            <header
                className="flex touch-none select-none items-center justify-between gap-2 border-b border-border bg-surface-elevated px-4 py-2 cursor-move"
                onPointerDown={startDrag}
                onPointerMove={moveDrag}
                onPointerUp={() => { dragRef.current = null; }}
                onPointerCancel={() => { dragRef.current = null; }}
                onLostPointerCapture={() => { dragRef.current = null; }}
            >
                <span className="flex items-center gap-2 text-sm font-semibold"><GripHorizontal size={16} aria-hidden="true" />Calculator</span>
                <button type="button" onClick={onClose} aria-label="Close calculator" className="rounded-lg p-2 text-muted hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-primary">
                    <X size={16} aria-hidden="true" />
                </button>
            </header>
            <div className="p-3">
                <div className="mb-3 rounded-lg border border-border bg-surface-elevated p-3 text-right">
                    <div className="h-5 text-xs text-muted">{state.stored !== null ? `${state.stored} ${state.operator}` : 'Quick calculation'}</div>
                    <output aria-label="Calculator result" aria-live="polite" className="block overflow-x-auto select-text text-2xl font-semibold tabular-nums">{state.display}</output>
                </div>
                <div className="grid grid-cols-4 gap-2">
                    {keys.map(key => (
                        <button
                            key={key}
                            type="button"
                            data-calculator-key={key}
                            aria-label={labels[key] ?? key}
                            onClick={() => pressKey(key)}
                            className={`flex h-11 items-center justify-center rounded-lg border text-base font-semibold focus-visible:ring-2 focus-visible:ring-focus ${key === '=' ? 'border-primary bg-primary text-on-primary hover:brightness-95' : 'border-border hover:bg-surface-alt ' + (['+', '-', '×', '÷'].includes(key) ? 'bg-primary/10 text-primary' : 'bg-surface-elevated text-foreground')}`}
                        >
                            {key === 'backspace' ? <Delete size={18} aria-hidden="true" /> : key}
                        </button>
                    ))}
                </div>
                <button type="button" onClick={copyResult} disabled={state.display === 'Error'} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg p-2 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary">
                    {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                    {copied ? 'Copied' : 'Copy result'}
                </button>
                {copyError && <p role="status" className="text-center text-xs text-muted">Select the result to copy it manually.</p>}
                <p className="mt-1 text-center text-xs text-muted">Drag to move · Esc to close</p>
            </div>
        </section>,
        document.body,
    );
}
