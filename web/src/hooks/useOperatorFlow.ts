import { useState, useCallback } from 'react';

export type OperatorFlowState =
    | 'IDLE'
    | 'ACTIVE_BILLING'
    | 'EDITING'
    | 'PAYMENT_READY'
    | 'RISK_ATTENTION'
    | 'BLOCKED';

export const useOperatorFlow = () => {
    const [state, setState] = useState<OperatorFlowState>('IDLE');

    const setFlowState = useCallback((newState: OperatorFlowState) => {
        setState(newState);
        console.log(`[POS FLOW] State changed to: ${newState}`);
    }, []);

    // UI Priority Mapping
    const getActionPriority = (action: string): 'PRIMARY' | 'SECONDARY' | 'INFORMATIONAL' => {
        switch (state) {
            case 'IDLE':
                if (action === 'NEW_BILL') return 'PRIMARY';
                return 'SECONDARY';

            case 'ACTIVE_BILLING':
                if (action === 'ADD_ITEM') return 'PRIMARY';
                if (action === 'PAYMENT') return 'SECONDARY';
                return 'INFORMATIONAL';

            case 'PAYMENT_READY':
                if (action === 'COMPLETE') return 'PRIMARY';
                return 'SECONDARY';

            case 'RISK_ATTENTION':
                if (action === 'RESOLVE') return 'PRIMARY';
                return 'SECONDARY';

            default:
                return 'INFORMATIONAL';
        }
    };

    return {
        state,
        setFlowState,
        getActionPriority,
        isIdle: state === 'IDLE',
        isBilling: state === 'ACTIVE_BILLING',
        isPaymentReady: state === 'PAYMENT_READY',
        isBlocked: state === 'BLOCKED'
    };
};
