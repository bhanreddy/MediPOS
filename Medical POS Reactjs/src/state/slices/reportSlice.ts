import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
    SalesReportSummary,
    TaxReport,
    StockValueReport,
    ExpiryReportItem,
    ProfitReport
} from '../../core/types';

interface ReportState {
    salesReport: SalesReportSummary | null;
    taxReport: TaxReport | null;
    stockValueReport: StockValueReport | null;
    expiryReport: ExpiryReportItem[];
    profitReport: ProfitReport | null;
    lastGenerated: number | null;
}

const initialState: ReportState = {
    salesReport: null,
    taxReport: null,
    stockValueReport: null,
    expiryReport: [],
    profitReport: null,
    lastGenerated: null
};

export const reportSlice = createSlice({
    name: 'reports',
    initialState,
    reducers: {
        setSalesReport: (state, action: PayloadAction<SalesReportSummary>) => {
            state.salesReport = action.payload;
            state.lastGenerated = Date.now();
        },
        setTaxReport: (state, action: PayloadAction<TaxReport>) => {
            state.taxReport = action.payload;
            state.lastGenerated = Date.now();
        },
        setStockValueReport: (state, action: PayloadAction<StockValueReport>) => {
            state.stockValueReport = action.payload;
            state.lastGenerated = Date.now();
        },
        setExpiryReport: (state, action: PayloadAction<ExpiryReportItem[]>) => {
            state.expiryReport = action.payload;
            state.lastGenerated = Date.now();
        },
        setProfitReport: (state, action: PayloadAction<ProfitReport>) => {
            state.profitReport = action.payload;
            state.lastGenerated = Date.now();
        },
        clearReports: () => {
            // Useful when user logs out or manual refresh
            return initialState;
        }
    }
});
