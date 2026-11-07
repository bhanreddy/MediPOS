import React, { Fragment } from 'react';
import type { ShopProfile, Batch } from '../../core/types';
import { BILL_PRINT_COPY, BRANDING } from '../../config/appContent';

interface BillItem {
    batch: Pick<Batch, 'batch_number' | 'expiry_date'>;
    productName: string;
    quantity: number;
    unitPrice: number;
    total: number;
    gstRate: number;
    discountPercent?: number;
    manufacturer?: string;
    hsn?: string;
    unit?: string;
    taxableAmount?: number;
}

export interface BillPrintLayoutProps {
    shopProfile: ShopProfile;
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    customerGstin?: string;
    placeOfSupply?: string;
    deliveryAddress?: string;
    taxableAmount?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    interstate?: boolean;
    pharmacist?: string;
    prescriber?: string;
    prescriptionReference?: string;
    isTaxInvoice?: boolean;
    invoiceNumber: string;
    date: string;
    time?: string;
    items: BillItem[];
    subtotal: number;
    gstAmount: number;
    discount: number;
    finalTotal: number;
    priceIncludesTax?: boolean;
    paymentMethod?: string;
    paidAmount?: number;
    walletAmount?: number;
    earnedCoins?: number;
    coinExpiry?: string;
    balanceDue?: number;
    paperWidthMm?: 58 | 80;
}

const money = (amount: number) => new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(amount);

function detail(value?: string): string {
    const text = value?.trim() || '';
    return /^(n\/?a|unknown|-)$/i.test(text) ? '' : text;
}

function expiry(value: string): string {
    const date = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
    if (!date) return detail(value);
    const parsed = new Date(date[1] + '-' + date[2] + '-' + date[3] + 'T00:00:00Z');
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
    });
}

export const BillPrintLayout: React.FC<BillPrintLayoutProps> = ({
    shopProfile, customerName, customerPhone, invoiceNumber, date, time, items,
    subtotal, gstAmount, discount, finalTotal, priceIncludesTax = false,
    customerAddress, customerGstin, placeOfSupply, deliveryAddress, taxableAmount, cgst, sgst, igst, interstate,
    pharmacist, prescriber, prescriptionReference, isTaxInvoice,
    paymentMethod, paidAmount, walletAmount = 0, earnedCoins = 0, coinExpiry, balanceDue, paperWidthMm = 80,
}) => {
    const address = [shopProfile.address_line_1, shopProfile.address_line_2,
        shopProfile.city, shopProfile.state, shopProfile.pincode].map(detail).filter(Boolean);
    const addressLine = [...new Set(address)].join(', ');
    const gstin = detail(shopProfile.gst_number);
    const licence = detail(shopProfile.drug_license_number);
    const owner = detail(shopProfile.owner_name);
    const phone = detail(shopProfile.phone_number);
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const hasPayment = paidAmount !== undefined || balanceDue !== undefined || Boolean(paymentMethod);

    return (
        <article className={'bill-print-root bill-print-root--' + paperWidthMm} aria-label={'Invoice ' + invoiceNumber}>
            <header className="receipt-header">
                {shopProfile.logo_url && <img className="receipt-logo" src={shopProfile.logo_url} alt="" />}
                <h1 className="receipt-shop-name">{shopProfile.medical_name}</h1>
                {owner && <p className="receipt-owner">{BILL_PRINT_COPY.propPrefix} {owner}</p>}
                {addressLine && <p className="receipt-address">{addressLine}</p>}
                {phone && <p className="receipt-phone">Phone: {phone}</p>}
                {(gstin || licence) && (
                    <div className="receipt-registration">
                        {gstin && <p>GSTIN: {gstin}</p>}
                        {licence && <p>Drug licence: {licence}</p>}
                    </div>
                )}
            </header>

            <section className="receipt-invoice" aria-label="Invoice details">
                <p className="receipt-kicker">{isTaxInvoice ? 'Tax invoice' : 'Sales invoice'}</p>
                <div className="receipt-invoice-id"><span>Invoice no.</span><strong>{invoiceNumber}</strong></div>
                <div className="receipt-date"><span>{date}</span>{time && <span>{time}</span>}</div>
                <div className="receipt-customer">
                    <span>Customer</span>
                    <strong>{customerName?.trim() || (customerPhone ? 'Customer' : 'Walk-in customer')}</strong>
                    {customerPhone && <span className="receipt-customer-phone">{customerPhone}</span>}
                </div>
                {customerAddress && <p>Recipient address {customerAddress}</p>}
                {customerGstin && <p>Recipient GSTIN {customerGstin}</p>}
                {placeOfSupply && <p>Place of supply (State code) {placeOfSupply}</p>}
                {deliveryAddress && deliveryAddress !== customerAddress && <p>Delivery address {deliveryAddress}</p>}
                {pharmacist && <p>Pharmacist {pharmacist}</p>}
                {prescriber && <p>Prescriber {prescriber}</p>}
                {prescriptionReference && <p>Prescription {prescriptionReference}</p>}
                {isTaxInvoice && <p>Reverse charge No</p>}
            </section>

            <table className="receipt-items" aria-label="Purchased medicines">
                <colgroup><col className="receipt-col-item" /><col className="receipt-col-qty" /><col className="receipt-col-rate" /><col className="receipt-col-amount" /></colgroup>
                <thead><tr><th scope="col">Medicine</th><th scope="col" className="receipt-number">Qty</th><th scope="col" className="receipt-number">Rate</th><th scope="col" className="receipt-number">Amount</th></tr></thead>
                <tbody>
                    {items.map((item, index) => {
                        const batch = detail(item.batch.batch_number);
                        const expiryDate = expiry(item.batch.expiry_date);
                        return (
                            <Fragment key={index}>
                                <tr className="receipt-item-main">
                                    <td className="receipt-item-name">{item.productName}</td>
                                    <td className="receipt-number">{item.quantity}{item.unit && <span> {item.unit}</span>}</td>
                                    <td className="receipt-number">{money(item.unitPrice)}</td>
                                    <td className="receipt-number receipt-item-amount">{money(item.total)}</td>
                                </tr>
                                <tr className="receipt-item-details"><td colSpan={4}>
                                    <div className="receipt-item-meta">
                                        {batch && <span>Batch: <b>{batch}</b></span>}
                                        {expiryDate && <span>Exp: <b>{expiryDate}</b></span>}
                                        {item.manufacturer && <span>Manufacturer {item.manufacturer}</span>}
                                        {item.hsn && <span>HSN {item.hsn}</span>}
                                        {item.taxableAmount !== undefined && <span>Taxable ₹{money(item.taxableAmount)}</span>}
                                        <span>GST: {item.gstRate}%</span>
                                        {Boolean(item.discountPercent && item.discountPercent > 0) && <span>Disc: {item.discountPercent}%</span>}
                                    </div>
                                </td></tr>
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
            <p className="receipt-item-count">{items.length} {items.length === 1 ? 'item' : 'items'}<span>Total qty: {Number(totalQuantity.toFixed(3))}</span></p>

            <section className="receipt-totals" aria-label="Invoice totals">
                <dl className="receipt-summary">
                    <div><dt>Subtotal</dt><dd>₹{money(subtotal)}</dd></div>
                    {discount > 0 && <div><dt>Discount</dt><dd>-₹{money(discount)}</dd></div>}
                    {taxableAmount !== undefined && <div><dt>Taxable value</dt><dd>₹{money(taxableAmount)}</dd></div>}
                    {interstate && igst !== undefined && <div><dt>IGST</dt><dd>₹{money(igst)}</dd></div>}
                    {!interstate && cgst !== undefined && <div><dt>CGST</dt><dd>₹{money(cgst)}</dd></div>}
                    {!interstate && sgst !== undefined && <div><dt>SGST</dt><dd>₹{money(sgst)}</dd></div>}
                    <div><dt>{priceIncludesTax ? 'GST (included)' : 'GST'}</dt><dd>₹{money(gstAmount)}</dd></div>
                </dl>
                <div className="receipt-grand-total"><span>Total</span><strong>₹{money(finalTotal)}</strong></div>
                {hasPayment && <dl className="receipt-payment">
                    {paymentMethod && <div><dt>Payment</dt><dd>{paymentMethod}</dd></div>}
                    {walletAmount > 0 && <div><dt>Nex Coins used</dt><dd>₹{money(walletAmount)}</dd></div>}
                    {paidAmount !== undefined && <div><dt>{walletAmount > 0 ? 'Collected payment' : 'Amount paid'}</dt><dd>₹{money(Math.max(0,paidAmount-walletAmount))}</dd></div>}
                    {earnedCoins>0 && <div><dt>Nex Coins earned</dt><dd>{money(earnedCoins)}</dd></div>}
                    {earnedCoins>0 && coinExpiry && <div><dt>Coins expire</dt><dd>{coinExpiry}</dd></div>}
                    {balanceDue !== undefined && balanceDue > 0 && <div className="receipt-balance"><dt>Balance due</dt><dd>₹{money(balanceDue)}</dd></div>}
                </dl>}
            </section>

            <footer className="receipt-footer">
                {isTaxInvoice && <p>Authorised signature __________________</p>}
                <p className="receipt-thanks">{BILL_PRINT_COPY.thankYou}</p>
                <p className="receipt-policy">{BILL_PRINT_COPY.returnPolicy}</p>
                <p className="receipt-wish">{BILL_PRINT_COPY.closingWish}</p>
                <p className="receipt-powered">{BRANDING.poweredByLine}</p>
            </footer>
        </article>
    );
};
