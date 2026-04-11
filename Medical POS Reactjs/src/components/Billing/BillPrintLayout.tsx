import React from 'react';
import type { ShopProfile, Batch } from '../../core/types';
import { BILL_PRINT_COPY, BRANDING } from '../../config/appContent';

interface BillItem {
    batch: Batch;
    productName: string;
    quantity: number;
    unitPrice: number; // Sale Price
    total: number;
    gstRate: number;
}

/** Line items at or below this count use a short (top-half A4) print layout; above uses full page height. */
export const BILL_PRINT_HALF_PAGE_MAX_ITEMS = 4;

export interface BillPrintLayoutProps {
    shopProfile: ShopProfile;
    customerName?: string;
    customerPhone?: string;
    invoiceNumber: string;
    date: string;
    items: BillItem[];
    subtotal: number;
    gstAmount: number;
    discount: number;
    finalTotal: number;
    /** When true, print styles pin the bill to the top ~half of the sheet (short receipts). */
    printHalfPage?: boolean;
}

export const BillPrintLayout: React.FC<BillPrintLayoutProps> = ({
    shopProfile,
    customerName,
    customerPhone,
    invoiceNumber,
    date,
    items,
    subtotal,
    gstAmount,
    discount,
    finalTotal,
    printHalfPage = false,
}) => {
    return (
        <div
            style={{ maxWidth: '78mm' }}
            className={`bill-print-root font-sans text-black bg-white p-4 mx-auto leading-tight ${
                printHalfPage ? 'bill-print-root--half' : 'bill-print-root--full'
            }`}
        >
            {/* 1. HEADER (Brand Section) */}
            <div className="text-center mb-4">
                {shopProfile.logo_url && (
                    <img
                        src={shopProfile.logo_url}
                        alt="Logo"
                        className="max-h-[60px] mx-auto mb-2 object-contain grayscale"
                    />
                )}
                {/* Brand Name - Largest, Boldest */}
                <h1 className="text-3xl font-black uppercase mb-1 leading-none tracking-wide">
                    {shopProfile.medical_name}
                </h1>
                {/* Owner Name - Subtitle */}
                {shopProfile.owner_name && (
                    <p className="text-sm font-medium uppercase mb-2">
                        ({BILL_PRINT_COPY.propPrefix} {shopProfile.owner_name})
                    </p>
                )}

                {/* Medical Details - Tightly Grouped, No Boxes */}
                <div className="text-[10px] space-y-0.5 opacity-70">
                    <p className="capitalize">
                        {shopProfile.address_line_1}
                        {shopProfile.address_line_2 && <>, {shopProfile.address_line_2}</>}
                        - {shopProfile.pincode}
                    </p>
                    <p>
                        Ph: {shopProfile.phone_number}
                    </p>
                    <div className="flex justify-center gap-1">
                        <span>GSTIN: {shopProfile.gst_number}</span>
                        <span>|</span>
                        <span>DL: {shopProfile.drug_license_number}</span>
                    </div>
                </div>
            </div>

            {/* 2. INVOICE METADATA */}
            {/* Single Row for Inv No & Date + Separator */}
            <div className="border-b border-black pb-1 mb-2">
                <div className="flex justify-between items-center text-xs font-bold uppercase">
                    <div>Inv: {invoiceNumber}</div>
                    <div>{date}</div>
                </div>
                {/* Customer Row (Optional) */}
                {(customerName || customerPhone) && (
                    <div className="text-[10px] mt-1 text-left font-medium">
                        {customerName && <span className="uppercase mr-2">{customerName}</span>}
                        {customerPhone && <span>{customerPhone}</span>}
                    </div>
                )}
            </div>

            {/* 3. ITEM TABLE (Clean, No Dashed Boxes) */}
            <table className="w-full text-xs mb-2">
                <thead>
                    <tr className="border-b border-black text-left">
                        <th className="py-1 w-5 align-bottom">#</th>
                        <th className="py-1 align-bottom">Item</th>
                        <th className="py-1 text-right align-bottom w-8">Qty</th>
                        <th className="py-1 text-right align-bottom w-10">Rate</th>
                        <th className="py-1 text-right align-bottom w-12">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, idx) => (
                        <tr key={idx}>
                            <td className="py-2 align-top text-[10px]">{idx + 1}</td>
                            <td className="py-2 align-top pr-1">
                                <div className="font-bold uppercase text-xs">{item.productName}</div>
                                <div className="text-[10px] opacity-70 font-medium leading-tight mt-0.5">
                                    Batch: {item.batch.batch_number} <br />
                                    Exp: {item.batch.expiry_date} | GST: {item.gstRate}%
                                </div>
                            </td>
                            <td className="py-2 align-top text-right font-medium">{item.quantity}</td>
                            <td className="py-2 align-top text-right">{item.unitPrice.toFixed(2)}</td>
                            <td className="py-2 align-top text-right font-bold">{item.total.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Bottom Separator (for Items) */}
            <div className="border-t border-black mb-2 opacity-10"></div>

            {/* 4. TOTALS SECTION (Clean, Right Aligned) */}
            <div className="flex justify-end mb-6">
                <div className="w-[60%] text-right space-y-1">
                    <div className="flex justify-between text-xs">
                        <span className="opacity-70">Subtotal</span>
                        <span className="font-medium">₹{subtotal.toFixed(2)}</span>
                    </div>
                    {discount > 0 && (
                        <div className="flex justify-between text-xs opacity-70">
                            <span>Discount</span>
                            <span>-₹{discount.toFixed(2)}</span>
                        </div>
                    )}
                    <div className="flex justify-between text-xs">
                        <span className="opacity-70">GST</span>
                        <span>₹{gstAmount.toFixed(2)}</span>
                    </div>

                    {/* Grand Total - Bold, Single Line Above */}
                    <div className="flex justify-between border-t border-black pt-2 mt-2 items-center">
                        <span className="text-sm font-bold uppercase tracking-wider">Total</span>
                        <span className="text-xl font-black">₹{finalTotal.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* 5. FOOTER (Emotional + Legal) */}
            <div className="text-center space-y-3 mt-4">
                <p className="text-[10px] font-bold uppercase tracking-wide">{BILL_PRINT_COPY.thankYou}</p>
                <p className="text-[8px] opacity-70 font-normal">{BILL_PRINT_COPY.returnPolicy}</p>
                <p className="text-[10px] font-medium italic">{BILL_PRINT_COPY.closingWish}</p>
                <p className="text-[8px] opacity-70 uppercase tracking-widest pt-2">{BRANDING.poweredByLine}</p>
            </div>
        </div>
    );
};
