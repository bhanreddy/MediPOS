# Medical POS — QA checklist (pre-release)

Assign each section and sign off with name and date.

## Billing flow (~30 min)

- [ ] Create cash sale → invoice number generated, stock deducted
- [ ] Create UPI sale with partial payment → balance_due > 0
- [ ] Create credit sale → customer.outstanding_balance updated
- [ ] Try oversell → correct error message, stock unchanged
- [ ] Create sale return → stock restored, outstanding reduced if applicable
- [ ] Invoice PDF downloads correctly, CGST = SGST
- [ ] WhatsApp invoice sent to customer phone (verify on device)
- [ ] Ctrl+Enter keyboard shortcut submits sale on web POS
- [ ] Cart persists after browser refresh (sessionStorage)

## Inventory (~15 min)

- [ ] Add medicine → appears in list
- [ ] Create purchase → batch created, stock increases
- [ ] Low stock alert appears after stock drops below threshold
- [ ] Expiry alert correct severity (critical/warning/watch)
- [ ] Add to shortbook from alert → appears in shortbook tab
- [ ] Mark shortbook item as ordered → disappears from open list

## Reports (~20 min)

- [ ] Dashboard KPIs match manually calculated values for today
- [ ] GST Sales Register: CGST + SGST = Total GST for every row
- [ ] P&L: net_profit = gross_revenue - cogs - total_expenses (verify with calculator)
- [ ] Schedule H1 report shows only is_schedule_h1=true medicines
- [ ] Export CSV downloads and opens correctly in Excel
- [ ] GSTR-1 JSON downloads; validate in GST sandbox before production filing

## Multitenancy (~10 min)

- [ ] Login as Clinic B user
- [ ] Clinic A's medicines, sales, customers — completely invisible
- [ ] Clinic B cannot access /admin routes (403 page shown)

## Subscription (~15 min)

- [ ] New clinic gets 14-day trial on registration
- [ ] Trial expired clinic → 402 on sale attempt
- [ ] Upgrade to Basic plan → Razorpay checkout opens
- [ ] Webhook simulated in Razorpay dashboard → subscription.status updates

## Mobile (~20 min, physical Android)

- [ ] Push notification received for low stock alert
- [ ] Tapping notification navigates to correct screen
- [ ] Bill scan: camera opens, image captured, OCR pre-fills form
- [ ] App handles network loss gracefully; offline banner and Save Offline on billing
- [ ] App recovers after network restored; offline sales sync with clear errors if stock changed
- [ ] Barcode scan adds medicine when barcode exists
- [ ] SecureStore session survives app close and reopen
