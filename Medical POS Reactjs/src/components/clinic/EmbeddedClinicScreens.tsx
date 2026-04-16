import React from 'react';
import { PurchaseScreen } from '../Purchase/PurchaseScreen';
import { InventoryScreen } from '../Inventory/InventoryScreen';

/** Full-height purchase workflow (F-keys) inside clinic shell padding. */
export const PurchaseWorkflowPage: React.FC = () => (
    <div className="p-4 md:p-6 h-full min-h-0 flex flex-col box-border">
        <PurchaseScreen />
    </div>
);

/** Inventory radar + add batch (F6) inside clinic shell padding. */
export const InventoryPageShell: React.FC = () => (
    <div className="p-4 md:p-6 h-full min-h-0 flex flex-col box-border">
        <InventoryScreen />
    </div>
);
