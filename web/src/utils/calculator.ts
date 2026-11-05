export type CalculatorOperator = '+' | '-' | '×' | '÷';

export interface CalculatorState {
    display: string;
    stored: number | null;
    operator: CalculatorOperator | null;
    replace: boolean;
}

export const initialCalculatorState: CalculatorState = {
    display: '0', stored: null, operator: null, replace: true,
};

function format(value: number): string {
    return Number.isFinite(value) ? String(Number(value.toPrecision(12))) : 'Error';
}

function calculate(left: number, right: number, operator: CalculatorOperator): number {
    switch (operator) {
        case '+': return left + right;
        case '-': return left - right;
        case '×': return left * right;
        case '÷': return left / right;
    }
}

/** A basic, sequential calculator; no expression evaluation or stock mutations. */
export function calculatorReducer(state: CalculatorState, key: string): CalculatorState {
    if (key === 'AC') return { ...initialCalculatorState };
    if (/^[0-9.]$/.test(key)) {
        const base = state.replace || state.display === 'Error' ? '0' : state.display;
        if (key === '.' && base.includes('.')) return state;
        const display = key === '.' ? `${base}.` : base === '0' ? key : base + key;
        if (display.replace(/[-.]/g, '').length > 12) return state;
        return { ...state, display, replace: false };
    }
    if (state.display === 'Error') return state;
    if (key === 'backspace') {
        if (state.replace) return state;
        const display = state.display.slice(0, -1);
        return { ...state, display: !display || display === '-' ? '0' : display };
    }
    if (key === '±') return { ...state, display: format(-Number(state.display)) };
    if (key === '%') {
        const value = Number(state.display) / 100;
        // 200 + 10% = 220; 200 × 10% = 20.
        const display = format(state.stored !== null && (state.operator === '+' || state.operator === '-')
            ? state.stored * value : value);
        return { ...state, display, replace: false };
    }
    if (key === '=' || ['+', '-', '×', '÷'].includes(key)) {
        const current = Number(state.display);
        const value = state.stored !== null && state.operator && !state.replace
            ? calculate(state.stored, current, state.operator) : current;
        const display = format(value);
        if (display === 'Error') return { ...initialCalculatorState, display };
        return {
            display,
            stored: key === '=' ? null : value,
            operator: key === '=' ? null : key as CalculatorOperator,
            replace: true,
        };
    }
    return state;
}
