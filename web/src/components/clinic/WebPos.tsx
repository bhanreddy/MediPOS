import { SisterStoresDialog } from './SisterStoresDialog';
import { getBranchSelection } from '../../lib/branchSelection';
import { CounterPrescriptionFields, emptyPrescriptionCheckout } from '../Prescriptions/CounterPrescriptionFields';
import { RegisterDialog } from './RegisterDialog';
import { CounterApprovalsDialog, CounterBatchDialog, ParkedBillsDialog, counterError, type CounterBatch, type ParkedBill } from './CounterDialogs';
import { SyncStatusBadge } from '../SyncStatusBadge';
import { desktopQueueAvailable,queueOfflineCommand } from '../../services/offlineCommandService';
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { useAuth } from "../../lib/auth";
import { Card } from "../ui/Card.tsx";
import { Button } from "../ui/Button";
import {
  Search,
  X,
  ShoppingCart,
  Check,
  Minus,
  Plus,
  Banknote,
  Smartphone,
  CreditCard,
  Wallet,
  UserRound,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePosStore, type PosCartLine } from "../../store/posStore";
import toast from "react-hot-toast";
import {
  useProductSearch,
  BILLING_SEARCH_KEY,
  type SearchResult,
} from "../../hooks/useProductSearch";
import { resolveBatchFromMedicineDetail } from "../../services/productLookupService";
import { BillingSearchDropdown } from "../Billing/BillingSearchDropdown";
import {
  UpiPaymentModals,
  type UpiModalState,
} from "../Billing/UpiPaymentModals";
import { useUpiId } from "../../hooks/useUpiId";
import { useShopDisplayName } from "../../hooks/useShopDisplayName";
import { buildUpiPaymentUri } from "../../lib/upiPaymentUri";
import api from "../../lib/api";
import { BillingService, type CartItem } from "../../services/billingService";
import { WalletService, walletMoney, walletDate } from "../../services/walletService";
import { CustomerService, normalizeBillingPhone } from "../../services/customerService";

import { InsufficientStockError } from "../../core/errors";
import type { RootState } from "../../state/store";
import type { PaymentMode, SaleItem, Sale } from "../../core/types";

const SEARCH_LIST_ID = "pos-medicine";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const PAYMENT_METHODS = [
  { id: "cash", label: "Cash", Icon: Banknote },
  { id: "upi", label: "UPI", Icon: Smartphone },
  { id: "card", label: "Card", Icon: CreditCard },
  { id: "credit", label: "Credit", Icon: Wallet },
  { id: "mixed", label: "Split", Icon: Plus },
] as const;

type CustomerHit = {
  id: string;
  name: string;
  phone: string;
  due: number;
};

type CustomerAccount = {
  due: number;
  limit: number;
};

const waitForNextPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

function roundMoney(amount: number) {
  return Math.round(amount * 100) / 100;
}

function formatRupee(amount: number) {
  return roundMoney(amount).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function cashSuggestions(payable: number): number[] {
  const exact = roundMoney(payable);
  if (exact <= 0) return [];
  const values = [exact];
  for (const step of [10, 50, 100, 500]) {
    const next = Math.ceil((exact - 1e-6) / step) * step;
    if (next > exact + 0.009 && !values.some((value) => Math.abs(value - next) < 0.01)) {
      values.push(next);
    }
  }
  return values.slice(0, 4);
}

function formatExpiry(iso?: string) {
  if (!iso) return "No expiry";
  const [year, month] = iso.slice(0, 10).split("-");
  const monthIndex = Number(month) - 1;
  if (!year || monthIndex < 0 || monthIndex > 11) return iso.slice(0, 7);
  return `${MONTHS[monthIndex]} ${year}`;
}

function daysUntilExpiry(iso?: string) {
  if (!iso) return null;
  const then = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((then.getTime() - today.getTime()) / 86_400_000);
}

function scheduleLabel(schedule?: string) {
  switch (schedule) {
    case "SCHEDULE_H":
      return "Sch H";
    case "SCHEDULE_H1":
      return "Sch H1";
    case "SCHEDULE_X":
      return "Sch X";
    case "NARCOTIC":
      return "Narcotic";
    default:
      return "";
  }
}

function mapPosPaymentToService(mode: string): PaymentMode {
  switch (mode) {
    case "cash":
      return "CASH";
    case "upi":
      return "UPI";
    case "card":
      return "CARD";
    case "credit":
      return "DUE";
    default:
      return "CASH";
  }
}

export const WebPos = () => {
  const store = usePosStore();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [showParked, setShowParked] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [sisterMedicine, setSisterMedicine] = useState<{ id: string; name: string } | null>(null);
  const [batchLine, setBatchLine] = useState<PosCartLine | null>(null);
  const [discountReason, setDiscountReason] = useState('');
  const [approvalFingerprint, setApprovalFingerprint] = useState('');
  const [parking, setParking] = useState(false);
  const parkRequest = useRef({ payload: '', id: '' });
  const role = useAuth(state => state.role);
  const isOwner = role === 'OWNER';
  const [prescription, setPrescription] = useState(emptyPrescriptionCheckout);
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [showDelivery, setShowDelivery] = useState(false);
  useEffect(() => { setPrescription(emptyPrescriptionCheckout); }, [store.customer_id]);
  const register = useQuery({
    queryKey: ['register-active'],
    queryFn: async () => (await api.get('/register/active')).data.data as { id: string; opened_at: string } | null,
  });
  const employeeDiscount = useQuery({
    queryKey: ['counter-discount-limit'],
    queryFn: async () => Number((await api.get('/counter/discount-limit')).data.data.max_basis_points),
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const customerNameRef = useRef<HTMLInputElement>(null);
  const customerSavingRef = useRef(false);
  const [customerSaving, setCustomerSaving] = useState(false);
  const paidInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { upiId } = useUpiId();
  const shopName = useShopDisplayName();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isCommitting, setIsCommitting] = useState(false);
  const committingRef = useRef(false);
  const [upiModal, setUpiModal] = useState<UpiModalState>("closed");
  const upiModalRef = useRef<UpiModalState>("closed");
  const [pendingUpiAmount, setPendingUpiAmount] = useState(0);
  const [upiQrValue, setUpiQrValue] = useState("");
  const [clearArmed, setClearArmed] = useState(false);
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([]);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [customerIndex, setCustomerIndex] = useState(0);
  const [customerAccount, setCustomerAccount] = useState<CustomerAccount | null>(null);
  const reduxUser = useSelector((s: RootState) => s.auth.user);
  const clinicUser = useAuth((s) => s.user);
  const cashierId = reduxUser?.id ?? clinicUser?.id ?? null;
  const wallet = useQuery({
    queryKey: ["customer-wallet", `${clinicUser?.id}:${clinicUser?.clinic_id}`, store.customer_id, 1],
    queryFn: ({signal}) => WalletService.get(store.customer_id!,1,signal),
    enabled: !!store.customer_id,
    retry: false,
    staleTime: 0,
  });
  const walletAvailable = wallet.data?.integrity_verified ? wallet.data.balance_paise : 0;
  const walletBlocked = store.use_nex_coins && store.wallet_amount_paise > 0 && (wallet.isPending || wallet.isError || wallet.isFetching);


  useEffect(() => {
    upiModalRef.current = upiModal;
  }, [upiModal]);

  useEffect(() => {
    void import("../../services/printerService").catch(() => {});
  }, []);

  const {
    results,
    isSearching,
    error: searchError,
  } = useProductSearch(searchTerm);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  useEffect(() => {
    if (!clearArmed) return;
    const timer = setTimeout(() => setClearArmed(false), 2500);
    return () => clearTimeout(timer);
  }, [clearArmed]);

  useEffect(() => {
    if (!store.customer_id) {
      setCustomerAccount(null);
      return;
    }
    let cancelled = false;
    void api
      .get(`/customers/${store.customer_id}`)
      .then((res) => {
        if (cancelled) return;
        const row = res.data?.data;
        setCustomerAccount({
          due: Number(row?.outstanding_balance || 0),
          limit: Number(row?.credit_limit || 0),
        });
      })
      .catch(() => {
        if (!cancelled) setCustomerAccount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [store.customer_id]);

  useEffect(() => {
    if (store.customer_id) return;
    const query = normalizeBillingPhone(store.customer_phone);
    if (query.length < 2) {
      setCustomerHits([]);
      setCustomerOpen(false);
      setCustomerSearching(false);
      return;
    }
    let cancelled = false;
    setCustomerSearching(true);
    const timer = setTimeout(() => {
      void api
        .get("/customers", { params: { q: query, limit: 6 } })
        .then((res) => {
          if (cancelled) return;
          const hits: CustomerHit[] = (res.data?.data || []).map((row: {
            id?: string;
            _local_id?: string;
            name?: string;
            phone?: string;
            outstanding_balance?: number;
          }) => ({
            id: String(row.id || row._local_id),
            name: String(row.name || "Customer"),
            phone: String(row.phone || ""),
            due: Number(row.outstanding_balance || 0),
          }));
          const existing = hits.find((hit) => normalizeBillingPhone(hit.phone) === query);
          if (existing) {
            usePosStore.getState().setCustomer(existing.id, existing.name, existing.phone);
            setCustomerHits([]);
            setCustomerOpen(false);
            return;
          }
          setCustomerHits(hits);
          setCustomerIndex(0);
          setCustomerOpen(true);
        })
        .catch(() => {
          if (!cancelled) setCustomerHits([]);
        })
        .finally(() => {
          if (!cancelled) setCustomerSearching(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [store.customer_phone, store.customer_id]);

  useEffect(() => {
    if (upiModal === "qr" && upiId && pendingUpiAmount > 0) {
      setUpiQrValue(
        buildUpiPaymentUri({
          vpa: upiId,
          payeeName: shopName,
          amount: pendingUpiAmount,
        }),
      );
    } else {
      setUpiQrValue("");
    }
  }, [upiModal, upiId, pendingUpiAmount, shopName]);

  const handleConfirmRef = useRef<() => void>(() => {});

  const regulatedLines = store.cart.filter(line => line.prescription_required || (line.schedule_classification && line.schedule_classification !== 'NONE'));
  const canDispense = role === 'PHARMACIST' && regulatedLines.length > 0;
  const dispensingAttestation = canDispense && prescription.signed && prescription.annotated ? {
    signed_original_checked: true as const,
    annotated_and_signed: true as const,
    prescription_register: prescription.prescriptionRegister.trim() || undefined,
    h1_register: prescription.h1Register.trim() || undefined,
    x_register_page: prescription.xPage.trim() || undefined,
    x_duplicate_reference: prescription.xDuplicate.trim() || undefined,
  } : undefined;
  const quoteFingerprint=JSON.stringify({items:store.cart.map(line=>({medicine_id:line.medicine_id,batch_id:line.manual_batch_id||undefined,allocation_mode:line.manual_batch_id?'manual':'auto',quantity:line.quantity,mrp:line.mrp,discount_pct:line.discount_pct,gst_rate:line.gst_rate})),discount:Number(store.bill_discount)||0,is_bill_discount_percentage:store.is_percentage_discount,
    ...(canDispense && prescription.id ? {customer_id:store.customer_id,prescription_id:prescription.id,dispensing_attestation:dispensingAttestation} : {}),
    place_of_supply_state_code: placeOfSupply || undefined, delivery_address: deliveryAddress.trim() || undefined,
  });
  const [serverQuote,setServerQuote]=useState<{fingerprint:string;subtotal:number;totalCgst:number;totalSgst:number;totalIgst:number;grandTotal:number;totalDiscount:number;billDiscountAmount:number;expected_total_paise:number;items:Array<{medicine_id:string;batch_id:string;quantity:number;mrp:number}>}|null>(null);
  const [quoteError,setQuoteError]=useState('');const [quoteLoading,setQuoteLoading]=useState(false);
  useEffect(()=>{
    setServerQuote(null);setQuoteError('');if(!store.cart.length){setQuoteLoading(false);return;}
    const controller=new AbortController();setQuoteLoading(true);
    const timer=setTimeout(()=>{api.post('/sales/quote',JSON.parse(quoteFingerprint),{signal:controller.signal,'axios-retry':{retries:0}})
      .then(response=>setServerQuote({...response.data.data,fingerprint:quoteFingerprint}))
      .catch(error=>{if(!controller.signal.aborted)setQuoteError(error.response?.data?.error?.message||'Unable to confirm stock and prices. Retry before checkout.');})
      .finally(()=>{if(!controller.signal.aborted)setQuoteLoading(false);});},180);
    return()=>{clearTimeout(timer);controller.abort();};
  },[quoteFingerprint]);

  const calculation = useMemo(() => {
    let subtotal = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    store.cart.forEach((item) => {
      const itemTotal = item.quantity * item.mrp * (1 - item.discount_pct / 100);
      const itemTax = itemTotal - itemTotal / (1 + item.gst_rate / 100);
      const itemCgst = itemTax / 2;
      const itemSgst = itemTax / 2;
      subtotal += itemTotal;
      cgst += itemCgst;
      sgst += itemSgst;
    });

    let billDiscountAmt = 0;
    if (store.is_percentage_discount) {
      billDiscountAmt = subtotal * ((parseFloat(store.bill_discount) || 0) / 100);
    } else {
      billDiscountAmt = parseFloat(store.bill_discount) || 0;
    }

    billDiscountAmt = Math.min(subtotal, Math.max(0, billDiscountAmt));
    const discountRatio = subtotal > 0 ? (subtotal - billDiscountAmt) / subtotal : 1;
    cgst *= discountRatio;
    sgst *= discountRatio;
    const activeQuote=serverQuote?.fingerprint===quoteFingerprint?serverQuote:null;
    if(activeQuote){subtotal=Number(activeQuote.subtotal);cgst=Number(activeQuote.totalCgst);sgst=Number(activeQuote.totalSgst);igst=Number(activeQuote.totalIgst);billDiscountAmt=Number(activeQuote.billDiscountAmount);}
    const payable = activeQuote?Number(activeQuote.grandTotal):roundMoney(subtotal - billDiscountAmt);
    const walletPaise = store.use_nex_coins && store.customer_id && !['credit', 'mixed'].includes(store.payment_mode)
      ? Math.min(Math.max(0,store.wallet_amount_paise || 0),walletAvailable,Math.floor(Math.round(payable*100)*(wallet.data?.policy?.redemption_limit_percent??100)/100)) : 0;
    const walletAmount = walletPaise / 100;
    const amountToCollect = roundMoney(payable-walletAmount);
    const rawPaid = store.paid_amount.trim();
    const parsedPaid = Number(rawPaid);
    const splitCollected = store.payments.filter(payment => payment.tender_type !== 'CREDIT')
      .reduce((sum, payment) => sum + (Math.round(payment.amount * 100) || 0), 0) / 100;
    const tendered = store.payment_mode === 'mixed' ? splitCollected : rawPaid !== "" && Number.isFinite(parsedPaid)
      ? Math.max(0, parsedPaid)
      : store.payment_mode === "credit"
        ? 0
        : amountToCollect;
    const balance_due = Math.max(0, roundMoney(amountToCollect - tendered));
    const changeDue = store.payment_mode === "cash"
      ? Math.max(0, roundMoney(tendered - amountToCollect))
      : 0;
    const collected = store.payment_mode === "mixed" ? splitCollected : store.payment_mode === "credit"
      ? Math.min(tendered, amountToCollect)
      : amountToCollect;

    return {
      subtotal,
      cgst,
      sgst,
      igst,
      billDiscountAmt,
      payable,
      walletPaise,
      walletAmount,
      amountToCollect,
      tendered,
      balance_due,
      changeDue,
      collected,
    };
  }, [
    serverQuote,quoteFingerprint,
    store.cart,
    store.bill_discount,
    store.is_percentage_discount,
    store.paid_amount,
    store.payments,
    store.payment_mode,
    store.wallet_amount_paise,
    store.use_nex_coins,
    store.customer_id,
    walletAvailable,
    wallet.data?.policy?.redemption_limit_percent,
  ]);

  const coinPolicy=wallet.data?.policy;
  const coinRedemptionCap=Math.min(walletAvailable,Math.floor(Math.round(calculation.payable*100)*(coinPolicy?.redemption_limit_percent??100)/100));
  const usingCoins = store.use_nex_coins;
  const canUseCoins = wallet.isSuccess && !wallet.isFetching && coinRedemptionCap > 0 && !['credit','mixed'].includes(store.payment_mode);
  const expectedCoins = store.customer_id && store.payment_mode!=='credit' && coinPolicy?.enabled && Math.round(calculation.payable*100)>=coinPolicy.minimum_sale_paise
    ? Math.min(coinPolicy.earning_cap_paise||Number.MAX_SAFE_INTEGER,Math.floor(Math.round(calculation.amountToCollect*100)*coinPolicy.rate_bps/10000)) : 0;
  const selectedCoinAmount=store.wallet_amount_paise;
  const setSelectedCoinAmount=store.setWalletAmount;
  useEffect(()=>{
    if(wallet.isSuccess&&!wallet.isFetching&&selectedCoinAmount>coinRedemptionCap)setSelectedCoinAmount(coinRedemptionCap);
  },[wallet.isSuccess,wallet.isFetching,selectedCoinAmount,setSelectedCoinAmount,coinRedemptionCap]);

  const unitCount = store.cart.reduce((sum, line) => sum + line.quantity, 0);
  const splitPayments = store.payments.filter(payment => payment.amount > 0 && payment.tender_type !== 'WALLET')
    .map(payment => ({
      tender_type: payment.tender_type as 'CASH' | 'UPI' | 'CARD' | 'CREDIT',
      amount_paise: Math.round(payment.amount * 100),
      reference_number: payment.reference_number?.trim() || undefined,
    }));
  const splitMode = store.payment_mode === 'mixed';
  const splitCredit = splitMode && splitPayments.some(payment => payment.tender_type === 'CREDIT');
  const needsCash = (store.payment_mode === 'cash' || store.payment_mode === 'credit') && calculation.collected > 0
    || splitMode && splitPayments.some(payment => payment.tender_type === 'CASH');
  const splitMismatch = splitMode && (splitPayments.length < 2
    || splitPayments.reduce((sum, payment) => sum + payment.amount_paise, 0) !== Math.round(calculation.payable * 100));
  const discountPaise = Math.round(Number(serverQuote?.totalDiscount || 0) * 100);
  const needsApproval = discountPaise * 10000 > Math.round(calculation.subtotal * 100) * (employeeDiscount.data ?? 1500);
  const approvalKey = JSON.stringify([quoteFingerprint, store.customer_id, discountReason.trim()]);
  const approvalId = approvalFingerprint === approvalKey ? store.supervisor_auth_id : null;
  const creditNeedsCustomer = (store.payment_mode === 'credit' || splitCredit) && !store.customer_id;
  const shortPay = !splitMode && store.payment_mode !== "credit" && calculation.balance_due > 0.009;
  const overCreditLimit = Boolean(
    (store.payment_mode === "credit" || splitCredit) &&
      customerAccount &&
      customerAccount.limit > 0 &&
      customerAccount.due + calculation.balance_due > customerAccount.limit + 0.009,
  );
  const confirmBlockedReason = store.cart.length === 0
    ? ""
    : quoteLoading || quoteError || serverQuote?.fingerprint !== quoteFingerprint
      ? quoteError || 'Confirming stock and prices'
      : needsCash && !register.data
      ? 'Open the cash register to collect cash'
      : splitMismatch
        ? 'Enter at least two tenders that add up to the bill total'
        : discountPaise > 0 && !discountReason.trim()
          ? 'Enter a discount reason'
          : needsApproval && !approvalId
            ? 'Ask an owner to approve this discount'
            : walletBlocked
      ? "Refresh the Nex Coins before confirming"
      : creditNeedsCustomer
      ? "Choose a saved customer for credit"
      : overCreditLimit
        ? "This bill would pass the customer's credit limit"
        : shortPay
          ? `Short ${formatRupee(calculation.balance_due)}`
          : "";

  const executeSale = useCallback(async () => {
    if (committingRef.current) return;
    if (store.cart.length && (!serverQuote || serverQuote.fingerprint!==quoteFingerprint || quoteLoading || quoteError)) { toast.error(quoteError||'Wait for stock and prices to be confirmed.');return; }
    if (!cashierId) {
      toast.error("Sign in to complete a sale");
      return;
    }
    if (store.cart.length === 0) {
      toast.error("Add a medicine before confirming");
      return;
    }
    if (!store.customer_id && store.customer_phone.trim()) {
      toast.error("Select a saved customer or enter a name and save the customer first");
      (customerNameRef.current || customerInputRef.current)?.focus();
      return;
    }
    if (confirmBlockedReason) {
      if (needsCash && !register.data) setRegisterOpen(true);
      toast.error(confirmBlockedReason);
      return;
    }
    if (!splitMode && store.payment_mode !== "credit" && calculation.balance_due > 0.009) {
      toast.error("Amount received is less than the bill. Collect the rest or switch to Credit.");
      return;
    }
    if (store.payment_mode === "credit" && !store.customer_id) {
      toast.error("Choose a saved customer before billing on credit");
      return;
    }

    if (walletBlocked) { toast.error("Refresh the Nex Coins before confirming"); return; }
    committingRef.current = true;
    setIsCommitting(true);
    try {
      const serviceCart: CartItem[] = store.cart.map((c) => ({
        product: { id: c.medicine_id, gst_rate: Number(c.gst_rate || 0) },
        quantity: c.quantity,
        discountPercent: c.discount_pct,
        batchId: c.manual_batch_id || c.batch_id,
        allocationMode: c.manual_batch_id ? "manual" : "auto",
        sellingPrice: c.mrp,
      }));

      const sale = await BillingService.finalizeSale(
        serviceCart,
        store.customer_id || undefined,
        cashierId,
        mapPosPaymentToService(store.payment_mode),
        { supplyType: "INTRA", paidAmount: calculation.collected, walletAmountPaise: calculation.walletPaise, requestId: store.checkout_request_id, billDiscount: Number(store.bill_discount)||0, isBillDiscountPercentage:store.is_percentage_discount, expectedTotalPaise:serverQuote?.expected_total_paise,
          paymentSplits: splitMode ? splitPayments : undefined, requireRegister: true, parkId: store.park_id,
          discountReason, discountApprovalId: approvalId,
          prescriptionId: canDispense ? prescription.id : undefined, dispensingAttestation,
          placeOfSupply, deliveryAddress: deliveryAddress.trim() },
      );

      const items = ((sale as { sale_items?: Record<string, unknown>[] }).sale_items || []).map(
        (item, index) => {
          const line = store.cart.find(line=>line.medicine_id===item.medicine_id) || store.cart[index];
          return {
            ...item,
            medicines: (item.medicines as {name?:string}) || { name: line?.medicine_name || "" },
            medicine_batches: item.medicine_batches || {
              batch_number: line?.batch_number || "",
              expiry_date: line?.expiry_date || "",
            },
          };
        },
      );

      setUpiModal("closed");
      setDiscountReason("");
      setPrescription(emptyPrescriptionCheckout);
      setPlaceOfSupply('');
      setDeliveryAddress('');
      setShowDelivery(false);
      setPendingUpiAmount(0);
      const earned=Number((sale as Sale & {nex_coins_earned_paise?:number}).nex_coins_earned_paise||0);
      toast.success(earned>0?`Sale confirmed · earned ${walletMoney(earned)} Nex Coins`:"Sale confirmed");
      store.reset();
      setSearchTerm("");
      setClearArmed(false);
      searchInputRef.current?.focus();
      queryClient.removeQueries({ queryKey: [BILLING_SEARCH_KEY] });
      void waitForNextPaint().then(async () => {
        try {
          await (await import("../../services/printerService")).PrinterService.printBill(
            sale,
            items as unknown as SaleItem[],
          );
        } catch {
          toast.error("Invoice saved. Printing failed; reprint it from Billing.");
        }
      });
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sales"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-wallet"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-history"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-history-profile"] }),
        queryClient.invalidateQueries({ queryKey: ["directory", "/customers"] }),
        queryClient.invalidateQueries({ queryKey: ["medicines"] }),
        queryClient.invalidateQueries({ queryKey: ["clinic-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ]).catch(() => {});
    } catch (e: unknown) {
      if (e instanceof InsufficientStockError) {
        toast.error(
          `Insufficient stock for ${e.productName ?? "item"}: need ${e.requested}, have ${e.available}`,
        );
      } else {
        toast.error(e instanceof Error ? e.message : "Sale failed");
      }
    } finally {
      committingRef.current = false;
      setIsCommitting(false);
    }
  }, [
    cashierId,
    store,
    calculation.balance_due,
    calculation.subtotal,
    calculation.collected,
    calculation.walletPaise,
    walletBlocked, confirmBlockedReason, needsCash, register.data, splitMode, splitPayments,
    discountReason, approvalId, serverQuote, quoteFingerprint, quoteLoading, quoteError,
    canDispense, prescription.id, dispensingAttestation, placeOfSupply, deliveryAddress,
    queryClient,
  ]);

  const closeUpiModal = () => {
    setUpiModal("closed");
    setPendingUpiAmount(0);
  };

  const handleConfirm = useCallback(async () => {
    if (committingRef.current) return;
    if (store.cart.length && (!serverQuote || serverQuote.fingerprint!==quoteFingerprint || quoteLoading || quoteError)) { toast.error(quoteError||'Wait for stock and prices to be confirmed.');return; }
    if (!cashierId) {
      toast.error("Sign in to complete a sale");
      return;
    }
    if (store.cart.length === 0) {
      toast.error("Add a medicine before confirming");
      searchInputRef.current?.focus();
      return;
    }
    if (!store.customer_id && store.customer_phone.trim()) {
      toast.error("Select a saved customer or enter a name and save the customer first");
      (customerNameRef.current || customerInputRef.current)?.focus();
      return;
    }
    if (confirmBlockedReason) {
      if (needsCash && !register.data) setRegisterOpen(true);
      toast.error(confirmBlockedReason);
      return;
    }
    if (shortPay) {
      toast.error("Amount received is less than the bill. Collect the rest or switch to Credit.");
      paidInputRef.current?.focus();
      return;
    }
    if (creditNeedsCustomer) {
      toast.error("Choose a saved customer before billing on credit");
      customerInputRef.current?.focus();
      return;
    }
    if (overCreditLimit) {
      toast.error("This bill would pass the customer's credit limit");
      return;
    }
    if (walletBlocked) { toast.error("Refresh the Nex Coins before confirming"); return; }
    if (store.payment_mode === "upi" && calculation.collected > 0) {
      const amount = roundMoney(calculation.collected);
      if (!upiId.trim()) {
        setPendingUpiAmount(amount);
        setUpiModal("missing_config");
        return;
      }
      setPendingUpiAmount(amount);
      setUpiModal("qr");
      return;
    }
    await executeSale();
  }, [
    store.payment_mode,
    store.customer_id,
    store.customer_phone,
    store.cart.length,
    cashierId,
    calculation.collected,
    upiId,
    executeSale,
    confirmBlockedReason, needsCash, register.data,
    shortPay,
    creditNeedsCustomer,
    overCreditLimit,
    walletBlocked,
  ]);

  handleConfirmRef.current = () => {
    void handleConfirm();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        if (upiModalRef.current !== "closed") return;
        handleConfirmRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const addSearchResultToCart = async (result: SearchResult) => {
    if (committingRef.current) return;
    if (result.totalStock <= 0 || !result.bestBatchId) {
      setSisterMedicine({ id: result.product.id, name: result.product.name });
      return;
    }

    try {
      const product = result.product;
      let batch = result.bestBatch;
      if (!batch) {
        const response = await api.get(`/inventory/medicines/${product.id}`);
        const detail = response.data?.data;
        batch =
          resolveBatchFromMedicineDetail(
            detail?.batches || detail?.medicine_batches || [],
            result.bestBatchId,
          ) || undefined;
      }
      if (!batch) {
        toast.error("No sellable batch found");
        return;
      }

      const maxStock = Number(result.totalStock || 0);
      if (maxStock <= 0) {
        toast.error("No stock available for this batch");
        return;
      }
      const batchKey = String(batch.id || batch._local_id || "");
      const existing = store.cart.find(
        (line) => line.medicine_id === product.id && line.batch_id === batchKey,
      );
      if (existing && existing.quantity >= maxStock) {
        toast.error(`Only ${maxStock} sellable units available`);
        return;
      }
      const price = Number(batch.sales_rate || batch.mrp || 0);

      store.addItem({
        medicine_id: product.id,
        medicine_name: product.name,
        generic_name: product.composition,
        brand_name: product.brand_name,
        dosage_form: product.type || "TABLET",
        unit_type: "STRIP",
        conversion_factor: 1.0,
        quantity: 1,
        unit_price: price,
        mrp: price,
        purchase_price: Number(batch.purchase_price || batch.purchase_rate || 0),
        batch_id: batchKey,
        manual_batch_id: null,
        batch_number: batch.batch_number || "",
        expiry_date: batch.expiry_date || "",
        max_stock: maxStock,
        gst_rate: Number(product.gst_rate || 0),
        discount_pct: 0,
        prescription_required: Boolean(product.prescription_required),
        schedule_classification: product.schedule_classification || "NONE",
        cold_chain_required: Boolean(product.cold_chain_required),
        batch_allocations: [],
        warnings: [],
      });
      setSearchTerm("");
      searchInputRef.current?.focus();
    } catch {
      toast.error("Failed to add item from search");
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) {
      if (e.key === "Escape") setSearchTerm("");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((idx) => Math.min(idx + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((idx) => Math.max(idx - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = results[selectedIndex];
      if (selected) void addSearchResultToCart(selected);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSearchTerm("");
    }
  };

  const selectCustomer = (hit: CustomerHit) => {
    store.setCustomer(hit.id, hit.name, hit.phone);
    setCustomerOpen(false);
    setCustomerHits([]);
    searchInputRef.current?.focus();
  };

  const saveCustomer = async () => {
    if (customerSavingRef.current || committingRef.current) return;
    const phone = normalizeBillingPhone(store.customer_phone);
    const name = store.customer_name.trim();
    if (!/^[6-9]\d{9}$/.test(phone)) {
      toast.error("Enter a valid 10-digit mobile number");
      customerInputRef.current?.focus();
      return;
    }
    if (!name) {
      toast.error("Customer name is required");
      customerNameRef.current?.focus();
      return;
    }
    customerSavingRef.current = true;
    setCustomerSaving(true);
    try {
      const customer = await CustomerService.findOrCreateCustomer({ name, phone });
      store.setCustomer(customer.id, customer.name, customer.phone || phone);
      setCustomerHits([]);
      setCustomerOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["directory", "/customers"] });
      toast.success("Customer saved");
      searchInputRef.current?.focus();
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      toast.error(message || (error instanceof Error ? error.message : "Failed to save customer"));
    } finally {
      customerSavingRef.current = false;
      setCustomerSaving(false);
    }
  };

  const clearCustomer = () => {
    store.setCustomer(null, "", "");
    setCustomerHits([]);
    setCustomerOpen(false);
    requestAnimationFrame(() => customerInputRef.current?.focus());
  };

  const handleCustomerKeyDown = (e: React.KeyboardEvent) => {
    if (!customerOpen || customerHits.length === 0) {
      if (e.key === "Escape") setCustomerOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCustomerIndex((index) => Math.min(index + 1, customerHits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCustomerIndex((index) => Math.max(index - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = customerHits[customerIndex];
      if (hit) selectCustomer(hit);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setCustomerOpen(false);
    }
  };

  const setLineQuantity = (item: PosCartLine, next: number) => {
    const maxStock = item.max_stock ?? 9999;
    store.updateQuantity(item.id, Math.min(Math.max(1, next), maxStock));
  };

  const savePendingDesktopBill=async()=>{
    if(!store.cart.length||committingRef.current)return;
    if(store.cart.some(line=>line.prescription_required||(line.schedule_classification&&line.schedule_classification!=='NONE'))) {toast.error('Restricted medicines require the verified online dispensing workflow.');return;}
    if(store.use_nex_coins){toast.error('Nex Coins require online verification.');return;}
    committingRef.current=true;
    try {
      const actor = useAuth.getState();
      const branch = getBranchSelection(actor.user?.id, sessionStorage.getItem('impersonate_clinic_id') || actor.clinic_id);
      await queueOfflineCommand({command_id:store.checkout_request_id,type:'SALE',payload:{...JSON.parse(quoteFingerprint),store_id:branch,customer_id:store.customer_id||null,
        payment_mode:store.payment_mode,paid_amount:calculation.collected,expected_total_paise:Math.round(calculation.payable*100),
        local_cart_snapshot:store.cart,local_created_at:new Date().toISOString()}});
      store.reset();toast.success('Pending bill saved on this device. Complete sync before treating it as a sale.');
    }catch(error){toast.error(String(error));}finally{committingRef.current=false;}
  };

  const clearBill = () => {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    store.reset();
    setSearchTerm("");
    setClearArmed(false);
    searchInputRef.current?.focus();
  };

  const showSearchPanel = searchTerm.trim().length >= 2;
  const activeOptionId = showSearchPanel && results[selectedIndex]
    ? `${SEARCH_LIST_ID}-option-${selectedIndex}`
    : undefined;
  async function parkCurrentBill() {
    if (!store.cart.length || parking) return;
    const snapshot = {
      resume_id: store.park_id || undefined,
      cart: store.cart,
      customer: { id: store.customer_id, name: store.customer_name, phone: store.customer_phone },
      totals: {
        bill_discount: store.bill_discount, is_percentage_discount: store.is_percentage_discount,
        discount_reason: discountReason, payment_mode: store.payment_mode, paid_amount: store.paid_amount, payments: store.payments,
      },
    };
    const fingerprint = JSON.stringify(snapshot);
    if (parkRequest.current.payload !== fingerprint) parkRequest.current = { payload: fingerprint, id: crypto.randomUUID() };
    setParking(true);
    try {
      const response = await api.post('/pos/park', { ...snapshot, request_id: parkRequest.current.id });
      store.reset();
      setDiscountReason('');
      parkRequest.current = { payload: '', id: '' };
      toast.success(`Bill parked · ${response.data.data.park_token}`);
    } catch (failure) {
      toast.error(counterError(failure, 'Unable to park the bill. Your cart is still open.'));
    } finally {
      setParking(false);
    }
  }

  function resumeBill(draft: ParkedBill) {
    const totals = draft.totals_snapshot;
    store.reset();
    usePosStore.setState({
      cart: draft.cart_snapshot,
      customer_id: draft.customer_snapshot.id ?? null,
      customer_name: draft.customer_snapshot.name ?? '',
      customer_phone: draft.customer_snapshot.phone ?? '',
      bill_discount: totals.bill_discount ?? '0',
      is_percentage_discount: !!totals.is_percentage_discount,
      payment_mode: totals.payment_mode ?? 'cash',
      paid_amount: totals.paid_amount ?? '',
      ...(totals.payments ? { payments: totals.payments } : {}),
      park_id: draft.id,
      park_token: draft.park_token,
    });
    setDiscountReason(totals.discount_reason ?? '');
    setShowParked(false);
  }

  function selectBatch(batch: CounterBatch | null) {
    if (!batchLine) return;
    usePosStore.setState(state => ({
      cart: state.cart.map(line => line.id !== batchLine.id ? line : {
        ...line, manual_batch_id: batch?.id ?? null, batch_id: batch?.id ?? line.batch_id,
        batch_number: batch?.batch_number ?? line.batch_number, expiry_date: batch?.expiry_date ?? line.expiry_date,
        mrp: batch?.selling_price ?? line.mrp, max_stock: batch?.available_quantity ?? 9999,
      }),
    }));
    setBatchLine(null);
  }

  async function requestOwnerApproval() {
    try {
      await api.post('/counter/discount-approvals', {
        ...JSON.parse(quoteFingerprint), customer_id: store.customer_id,
        _local_id: store.checkout_request_id, discount_reason: discountReason.trim(),
      });
      setShowApprovals(true);
      toast.success('Discount sent for owner approval.');
    } catch (failure) {
      toast.error(counterError(failure, 'Unable to request approval.'));
    }
  }

  const suggestions = store.payment_mode === "cash" ? cashSuggestions(calculation.amountToCollect) : [];
  const receivedLabel = store.payment_mode === "credit" ? "Received now" : "Amount received";
  const receivedHint = store.payment_mode === "credit"
    ? "Leave this blank to put the whole bill on credit."
    : calculation.walletAmount > 0 ? "Collect the remainder after Nex Coins." : "Leave this blank to collect the full bill.";

  return (
    <fieldset
      disabled={isCommitting || upiModal !== "closed"}
      aria-label="Current bill"
      className={`mx-auto flex min-h-full w-full max-w-[1600px] min-w-0 flex-col gap-4 border-0 p-4 md:p-6 lg:flex-row lg:items-start ${
        store.cart.length > 0 ? "max-[480px]:pb-40" : ""
      }`}
    >
      <section className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-[3]">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setRegisterOpen(true)}>{register.data ? 'Cash register · Open' : 'Cash register'}</Button>
          <Button type="button" variant="secondary" onClick={() => void parkCurrentBill()} disabled={!store.cart.length || parking}>
            {store.park_id ? 'Save and park bill' : 'Park bill'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setShowParked(true)}>Parked bills</Button>
          <Button type="button" variant="secondary" onClick={() => setShowApprovals(true)}>Discount approvals</Button>
          {store.park_token && <span className="self-center text-sm text-muted">Resumed {store.park_token}</span>}
        </div>
        {registerOpen && <RegisterDialog session={register.data ?? null} onChange={() => void register.refetch()} onClose={() => setRegisterOpen(false)} />}
        {showParked && <ParkedBillsDialog hasCurrentBill={!!store.cart.length} onResume={resumeBill} onClose={() => setShowParked(false)} />}
        {sisterMedicine && <SisterStoresDialog medicine={sisterMedicine} onClose={() => setSisterMedicine(null)} />}
        {batchLine && <CounterBatchDialog line={batchLine} onSelect={selectBatch} onClose={() => setBatchLine(null)} />}
        {showApprovals && <CounterApprovalsDialog isOwner={isOwner} checkoutId={store.checkout_request_id}
          onClose={() => setShowApprovals(false)} onUse={id => {
            store.setSupervisorAuth(id); setApprovalFingerprint(approvalKey); setShowApprovals(false);
          }} />}
        {desktopQueueAvailable()&&<div className="flex justify-end"><SyncStatusBadge/></div>}
      {(quoteLoading||quoteError)&&<p role={quoteError?'alert':'status'} className={quoteError?'text-sm text-danger':'text-sm text-muted'}>{quoteError||'Confirming batch stock and prices…'}</p>}
        {quoteError&&desktopQueueAvailable()&&store.cart.length>0&&regulatedLines.length===0&&<button type="button" className="rounded-lg border border-border px-3 py-2 text-sm" onClick={()=>void savePendingDesktopBill()}>Save pending bill on this device</button>}
        {searchError && (
          <p role="alert" className="text-sm text-danger">
            {searchError}
          </p>
        )}
        <div className="relative z-20 max-lg:sticky max-lg:top-0 max-lg:-mx-4 max-lg:bg-background max-lg:px-4 max-lg:py-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted max-lg:left-8" />
          <input
            ref={searchInputRef}
            type="text"
            autoFocus
            role="combobox"
            aria-expanded={showSearchPanel}
            aria-controls={showSearchPanel ? `${SEARCH_LIST_ID}-list` : undefined}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            placeholder="Search a medicine or scan its barcode"
            aria-label="Search medicines or scan a barcode"
            className="relative z-0 w-full rounded-xl border border-border bg-surface py-3.5 pl-12 pr-12 text-base text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {searchTerm && (
            <button
              type="button"
              className="absolute right-3 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-surface-elevated hover:text-foreground max-lg:right-6"
              aria-label="Clear search"
              onClick={() => {
                setSearchTerm("");
                searchInputRef.current?.focus();
              }}
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {showSearchPanel && (
            <>
              <BillingSearchDropdown
                results={results}
                selectedIndex={selectedIndex}
                onSelect={(res) => void addSearchResultToCart(res)}
                onHighlight={setSelectedIndex}
                isSearching={isSearching}
                idPrefix={SEARCH_LIST_ID}
              />
              {!searchError && !isSearching && results.length === 0 && (
                <div
                  className="absolute top-full right-0 left-0 z-[100] mt-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted shadow-2xl"
                  role="status"
                >
                  No medicines match “{searchTerm.trim()}”.
                </div>
              )}
            </>
          )}
          {searchTerm.trim().length === 1 && (
            <p className="mt-2 text-xs text-muted">Type one more character to search.</p>
          )}
        </div>

        <Card className="flex flex-col border border-border bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground-strong">Current bill</h2>
              <p className="text-xs text-muted">
                {store.cart.length === 0
                  ? "Nothing added yet"
                  : `${store.cart.length} ${store.cart.length === 1 ? "medicine" : "medicines"} · ${unitCount} ${unitCount === 1 ? "unit" : "units"}`}
              </p>
            </div>
            {store.cart.length > 0 && (
              <button
                type="button"
                onClick={clearBill}
                className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${
                  clearArmed
                    ? "bg-danger text-on-danger"
                    : "text-muted hover:bg-danger/10 hover:text-danger"
                }`}
              >
                {clearArmed ? "Clear this bill?" : "Clear bill"}
              </button>
            )}
          </div>

          {store.cart.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
                <ShoppingCart className="h-5 w-5" aria-hidden />
              </span>
              <p className="mt-4 text-sm font-semibold text-foreground-strong">
                Scan a barcode or search to start
              </p>
              <p className="mt-1 max-w-sm text-sm text-muted">
                Enter adds the highlighted medicine. Ctrl+Enter confirms the sale.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {store.cart.map((item) => {
                const maxStock = item.max_stock ?? 9999;
                const atMax = item.quantity >= maxStock;
                const daysLeft = daysUntilExpiry(item.expiry_date);
                const expiryTone = daysLeft !== null && daysLeft <= 30
                  ? "text-danger"
                  : daysLeft !== null && daysLeft <= 90
                    ? "text-warning"
                    : "text-muted";
                const expiryNote = daysLeft !== null && daysLeft < 0
                  ? "expired"
                  : daysLeft !== null && daysLeft <= 90
                    ? `${daysLeft}d left`
                    : "";
                const schedule = scheduleLabel(item.schedule_classification);
                return (
                  <li key={item.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-foreground-strong">
                          {item.medicine_name}
                        </p>
                        <p className={`mt-1 text-xs ${expiryTone}`}>
                          <span className="font-mono text-muted">{item.manual_batch_id ? item.batch_number : serverQuote?.items.filter(allocation=>allocation.medicine_id===item.medicine_id).map(allocation=>`${allocation.quantity} units`).join(' + ') || 'Auto · FEFO across available batches'}</span>
                          {" · "}
                          Exp {formatExpiry(item.expiry_date)}
                          {expiryNote ? ` · ${expiryNote}` : ""}
                          {" · "}
                          {formatRupee(item.mrp)} each
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <button type="button" className="text-xs font-semibold text-primary" onClick={() => setBatchLine(item)}>Change batch</button>
                          <button type="button" className="text-xs font-semibold text-primary"
                            onClick={() => setSisterMedicine({ id: item.medicine_id, name: item.medicine_name })}>Check sister stores</button>
                          <label className="text-xs text-muted">Item discount (%)
                            <input aria-label={`Item discount for ${item.medicine_name}`} type="number" min="0" max="100" step="0.01"
                              className="ml-1 w-16 rounded border border-border bg-surface px-1 py-1 text-foreground"
                              value={item.discount_pct || ''} onChange={event => store.updateLineDiscount(item.id, Math.min(100, Math.max(0, Number(event.target.value) || 0)))} />
                          </label>
                        </div>
                        {(item.prescription_required || schedule || item.cold_chain_required) && (
                          <p className="mt-2 flex flex-wrap gap-1.5">
                            {item.prescription_required && (
                              <span className="rounded-md bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold text-warning">Rx</span>
                            )}
                            {schedule && (
                              <span className="rounded-md bg-danger/10 px-1.5 py-0.5 text-[11px] font-semibold text-danger">{schedule}</span>
                            )}
                            {item.cold_chain_required && (
                              <span className="rounded-md bg-info/10 px-1.5 py-0.5 text-[11px] font-semibold text-info">Keep cold</span>
                            )}
                          </p>
                        )}
                      </div>
                      <p className="shrink-0 text-base font-semibold tabular-nums text-foreground-strong">
                        {formatRupee(serverQuote?.fingerprint===quoteFingerprint ? serverQuote.items.filter(allocation=>allocation.medicine_id===item.medicine_id).reduce((sum,allocation)=>sum+allocation.quantity*allocation.mrp,0) : item.quantity*item.mrp)}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-surface text-foreground hover:border-primary disabled:opacity-40"
                          aria-label={`Decrease quantity of ${item.medicine_name}`}
                          disabled={item.quantity <= 1}
                          onClick={() => setLineQuantity(item, item.quantity - 1)}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`Quantity of ${item.medicine_name}`}
                          value={item.quantity}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, "");
                            if (!digits) return;
                            setLineQuantity(item, parseInt(digits, 10));
                          }}
                          onWheel={(e) => e.currentTarget.blur()}
                          className={`h-11 w-14 rounded-lg border bg-surface text-center text-base font-semibold outline-none focus:border-primary ${
                            atMax ? "border-warning" : "border-border"
                          }`}
                        />
                        <button
                          type="button"
                          className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-surface text-foreground hover:border-primary disabled:opacity-40"
                          aria-label={`Increase quantity of ${item.medicine_name}`}
                          disabled={atMax}
                          onClick={() => setLineQuantity(item, item.quantity + 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <span className={`hidden text-xs sm:inline ${atMax ? "text-warning" : "text-muted"}`}>
                          {atMax ? `Only ${maxStock} left` : `${maxStock} in stock`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => store.removeItem(item.id)}
                        aria-label={`Remove ${item.medicine_name}`}
                        className="grid h-11 w-11 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {calculation.billDiscountAmt > 0 && store.cart.length > 0 && (
            <p className="border-t border-border px-4 py-2 text-xs text-muted">
              Line totals are before the bill discount.
            </p>
          )}
        </Card>
      </section>

      <aside className="flex w-full min-w-0 flex-col lg:sticky lg:top-4 lg:w-[22.5rem] lg:flex-none lg:self-start">
        <Card className="flex flex-col gap-4 overflow-visible border border-border bg-surface p-4 sm:p-5 lg:grid lg:max-h-[calc(100dvh-6rem)] lg:grid-rows-[minmax(0,1fr)_auto] lg:gap-4 lg:overflow-hidden">
          <div className="flex flex-col gap-4 lg:min-h-0 lg:overflow-y-auto">
          <div className="relative">
            {store.customer_id ? (
              <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/8 px-3 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                  <UserRound className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground-strong">{store.customer_name || "Customer"}</p>
                  <p className="text-xs text-muted">{store.customer_phone || "No phone"}</p>
                  <Link to={`/customers/${encodeURIComponent(store.customer_id)}`} className="mt-1 inline-block text-xs font-semibold text-primary hover:underline">View purchase history</Link>
                  {customerAccount && customerAccount.due > 0 && (
                    <p className="mt-1 text-xs font-semibold text-warning">
                      Already owes {formatRupee(customerAccount.due)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={clearCustomer}
                  disabled={customerSaving || isCommitting}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <label htmlFor="pos-customer" className="mb-1.5 block text-xs font-semibold text-muted">
                  Customer
                </label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    id="pos-customer"
                    ref={customerInputRef}
                    placeholder="Phone or name, optional"
                    aria-label="Find customer by phone or name"
                    aria-expanded={customerOpen}
                    aria-controls="pos-customer-list"
                    aria-autocomplete="list"
                    type="text"
                    disabled={customerSaving || isCommitting}
                    value={store.customer_phone}
                    onChange={(e) => store.setCustomer(null, "", e.target.value)}
                    onKeyDown={handleCustomerKeyDown}
                    onFocus={() => {
                      if (customerHits.length > 0) setCustomerOpen(true);
                    }}
                    onBlur={() => {
                      window.setTimeout(() => setCustomerOpen(false), 150);
                    }}
                    autoComplete="off"
                    className="w-full rounded-xl border border-border bg-surface py-3 pr-3 pl-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {customerSearching
                    ? "Looking up customers…"
                    : customerOpen && customerHits.length === 0
                      ? "New customer? Enter their mobile number and name below."
                      : "Walk-in if you leave this empty. Credit needs a saved customer."}
                </p>
                {store.customer_phone.trim() && /^[+\d\s().-]+$/.test(store.customer_phone.trim()) && (
                  <form
                    className="mt-3 space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveCustomer();
                    }}
                  >
                    <label htmlFor="pos-customer-name" className="block text-xs font-semibold text-muted">
                      Customer name *
                    </label>
                    <input
                      id="pos-customer-name"
                      ref={customerNameRef}
                      type="text"
                      autoComplete="name"
                      placeholder="Enter customer name"
                      required
                      maxLength={200}
                      disabled={customerSaving || isCommitting}
                      value={store.customer_name}
                      onChange={(event) => store.setCustomer(null, event.target.value, store.customer_phone)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-xs text-muted">Save their name and phone to Customers and use them on this bill.</p>
                    <Button type="submit" size="sm" isLoading={customerSaving} disabled={customerSearching || isCommitting}>
                      Save customer
                    </Button>
                  </form>
                )}
                {customerOpen && customerHits.length > 0 && (
                  <ul
                    id="pos-customer-list"
                    role="listbox"
                    className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-surface shadow-2xl"
                  >
                    {customerHits.map((hit, index) => (
                      <li key={hit.id} role="option" aria-selected={index === customerIndex}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectCustomer(hit)}
                          className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left ${
                            index === customerIndex ? "bg-primary/10" : "hover:bg-surface-elevated"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{hit.name}</span>
                            <span className="block text-xs text-muted">{hit.phone || "No phone"}</span>
                          </span>
                          {hit.due > 0 && (
                            <span className="shrink-0 text-xs font-semibold text-warning">
                              Due {formatRupee(hit.due)}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {store.customer_id && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Nex Coins</span>
                <span className="font-bold text-primary">{wallet.isPending ? 'Checking…' : wallet.isError ? 'Unavailable' : `${walletMoney(walletAvailable)} available`}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <label htmlFor="pos-use-coins" className="cursor-pointer text-sm font-semibold">Use Nex Coins on this bill</label>
                <button
                  id="pos-use-coins"
                  type="button"
                  role="switch"
                  aria-checked={usingCoins}
                  aria-describedby="pos-coins-hint"
                  disabled={isCommitting || (!usingCoins && !canUseCoins)}
                  onClick={() => store.setUseNexCoins(!usingCoins, coinRedemptionCap)}
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                >
                  <span aria-hidden className={`relative h-6 w-11 rounded-full transition-colors ${usingCoins ? 'bg-primary' : 'bg-border'}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${usingCoins ? 'left-[22px]' : 'left-0.5'}`} />
                  </span>
                </button>
              </div>
              {wallet.isError ? <button type="button" className="mt-2 text-xs font-semibold text-primary" onClick={() => void wallet.refetch()}>Retry wallet check</button> : <>
                {wallet.data?.next_expiry && <p className="mt-1 text-xs text-muted">Next deadline: {walletDate(wallet.data.next_expiry)}</p>}
                {usingCoins && <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label htmlFor="pos-wallet-use" className="text-xs font-semibold">Coins to use</label>
                  <input id="pos-wallet-use" aria-label="Nex Coins amount" inputMode="decimal" type="number" min="0" step="0.01" max={coinRedemptionCap/100} value={store.wallet_amount_paise ? store.wallet_amount_paise / 100 : ''} placeholder="0.00" disabled={!canUseCoins || isCommitting} onChange={e => store.setWalletAmount(Math.min(coinRedemptionCap,Math.max(0,Math.round(Number(e.target.value)*100)||0)))} className="w-24 rounded-lg border border-border bg-surface px-2 py-1.5 text-right text-sm disabled:opacity-50"/>
                  <button type="button" disabled={!canUseCoins || isCommitting} className="min-h-9 text-xs font-semibold text-primary hover:underline disabled:opacity-50" onClick={() => store.setWalletAmount(coinRedemptionCap)}>Use maximum</button>
                </div>}
              </>}
              <p id="pos-coins-hint" className="mt-2 text-xs text-muted">
                {store.payment_mode === 'credit' ? 'Choose Cash, UPI or Card to redeem Nex Coins.'
                  : wallet.isPending ? 'Checking the customer’s available coins.'
                  : wallet.isError ? 'Coins are unavailable. You can continue without using coins.'
                  : walletAvailable <= 0 ? 'No Nex Coins available to use.'
                  : coinPolicy?.redemption_limit_percent === 0 ? 'Coin redemption is disabled in Settings.'
                  : coinRedemptionCap <= 0 ? 'Add items to the bill to use Nex Coins.'
                  : usingCoins ? `Nearest-expiry coins first · maximum ${coinPolicy?.redemption_limit_percent ?? 100}% of this bill.`
                  : 'Coins will stay in the customer’s wallet. Eligible purchases still earn new coins.'}
              </p>
            </div>
          )}

          <div className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between text-muted">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatRupee(calculation.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-muted">
              <span className="flex items-center gap-2">
                Discount
                <button
                  type="button"
                  aria-pressed={store.is_percentage_discount}
                  aria-label={store.is_percentage_discount ? "Discount is a percentage. Switch to rupees." : "Discount is in rupees. Switch to percentage."}
                  className="rounded-md border border-border bg-surface-elevated px-1.5 py-0.5 text-xs font-semibold text-foreground"
                  onClick={() => store.setDiscount(store.bill_discount, !store.is_percentage_discount)}
                >
                  {store.is_percentage_discount ? "%" : "₹"}
                </button>
              </span>
              <span className="flex items-center gap-2">
                {calculation.billDiscountAmt > 0 && (
                  <span className="text-xs font-semibold text-success tabular-nums">
                    −{formatRupee(calculation.billDiscountAmt)}
                  </span>
                )}
                <input
                  type="text"
                  aria-label="Bill discount"
                  inputMode="decimal"
                  className="w-20 rounded-lg border border-border bg-surface-elevated px-2 py-1.5 text-right outline-none focus:border-primary"
                  value={store.bill_discount}
                  onChange={(e) => store.setDiscount(e.target.value, store.is_percentage_discount)}
                />
              </span>
            </div>
            <div className="flex items-center justify-between text-muted" title="Prices already include GST. This is the tax portion of the total.">
              <span>GST included</span>
              <span className="tabular-nums">{formatRupee(calculation.cgst + calculation.sgst + calculation.igst)}</span>
            </div>
          </div>
          </div>

          {regulatedLines.length > 0 && (canDispense
            ? <CounterPrescriptionFields customerId={store.customer_id} value={prescription} onChange={setPrescription}
                needsGeneral={regulatedLines.some(line => line.schedule_classification !== 'SCHEDULE_X')}
                needsH1={regulatedLines.some(line => line.schedule_classification === 'SCHEDULE_H1')}
                needsX={regulatedLines.some(line => line.schedule_classification === 'SCHEDULE_X')} />
            : <p className="rounded-lg bg-warning/10 p-3 text-sm">A registered pharmacist must complete a bill containing restricted medicines.</p>)}
          <button type="button" aria-expanded={showDelivery} className="text-left text-sm font-semibold text-primary"
            onClick={() => setShowDelivery(value => !value)}>Place of supply and delivery</button>
          {showDelivery && <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">Place of supply (State code)
              <input className="block w-full rounded border border-border bg-surface p-2" inputMode="numeric" maxLength={2}
                placeholder="Store State by default" value={placeOfSupply}
                onChange={event => setPlaceOfSupply(event.target.value.replace(/[^0-9]/g, ''))} />
            </label>
            <label className="text-sm">Delivery address
              <input className="block w-full rounded border border-border bg-surface p-2" maxLength={500}
                value={deliveryAddress} onChange={event => setDeliveryAddress(event.target.value)} />
            </label>
          </div>}
          {discountPaise > 0 && <div className="space-y-2">
            <label className="block text-sm">Discount reason
              <input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" value={discountReason} maxLength={400}
                onChange={event => setDiscountReason(event.target.value)} />
            </label>
            {needsApproval && <Button type="button" variant="secondary" disabled={!discountReason.trim() || !!approvalId}
              onClick={() => void requestOwnerApproval()}>{approvalId ? 'Discount approved' : 'Request owner approval'}</Button>}
          </div>}

          <div className="flex flex-col gap-3">
          <div className="rounded-xl bg-primary/8 px-4 py-3">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Total</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-primary tabular-nums" aria-live="polite">
              {formatRupee(calculation.payable)}
            </p>
          </div>

          {store.customer_id && expectedCoins>0 && <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">Earn {walletMoney(expectedCoins)} Nex Coins after payment · valid {coinPolicy?.expiry_days||90} days</p>}
          {!store.customer_id && <p className="text-xs text-muted">Save or select a customer to earn or use Nex Coins.</p>}
          {calculation.walletAmount > 0 && <div className="space-y-1 rounded-lg bg-success/5 px-3 py-2 text-sm"><p className="flex justify-between"><span>Nex Coins</span><strong>−{formatRupee(calculation.walletAmount)}</strong></p><p className="flex justify-between font-semibold"><span>Remaining to collect</span><span>{formatRupee(calculation.amountToCollect)}</span></p></div>}

          <div
            role="radiogroup"
            aria-label="Payment method"
            className="grid grid-cols-5 gap-1 rounded-xl border border-border bg-surface-elevated p-1"
          >
            {PAYMENT_METHODS.map(({ id, label, Icon }) => {
              const selected = store.payment_mode === id;
              return (
                <button
                  type="button"
                  key={id}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    if (store.payment_mode === id) return;
                    store.setPaymentMode(id);
                    store.setPaidAmount("");
                    if (id === 'mixed') {
                      store.setUseNexCoins(false);
                      if (store.payments.length < 2) store.setPayments([{ tender_type: 'CASH', amount: 0 }, { tender_type: 'UPI', amount: 0 }]);
                    }
                  }}
                  className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-xs font-semibold transition-colors ${
                    selected
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>

          {splitMode ? <div className="space-y-2">
            {store.payments.map((payment, index) => {
              const update = (values: Partial<typeof payment>) => store.setPayments(store.payments.map((entry, row) => row === index ? { ...entry, ...values } : entry));
              return <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-2 text-sm" key={index}>
                <label>Method {index + 1}
                  <select className="block w-full rounded border border-border bg-surface p-1" value={payment.tender_type}
                    onChange={event => update({ tender_type: event.target.value as typeof payment.tender_type })}>
                    <option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option><option value="CREDIT">Credit</option>
                  </select>
                </label>
                <label>Amount {index + 1} (₹)
                  <input className="block w-full rounded border border-border bg-surface p-1" type="number" min="0" step="0.01"
                    value={payment.amount || ''} onChange={event => update({ amount: Math.max(0, Number(event.target.value) || 0) })} />
                </label>
                {(payment.tender_type === 'UPI' || payment.tender_type === 'CARD') && <label>Reference {index + 1}
                  <input className="block w-full rounded border border-border bg-surface p-1" value={payment.reference_number || ''}
                    maxLength={255} onChange={event => update({ reference_number: event.target.value })} />
                </label>}
                {store.payments.length > 2 && <button type="button" className="text-danger" onClick={() => store.setPayments(store.payments.filter((_entry, row) => row !== index))}>Remove tender {index + 1}</button>}
              </div>;
            })}
            <Button type="button" variant="secondary" disabled={store.payments.length >= 20}
              onClick={() => store.setPayments([...store.payments, { tender_type: 'CARD', amount: 0 }])}>Add tender</Button>
            {confirmBlockedReason && <p role="alert" className="text-sm font-semibold text-danger">{confirmBlockedReason}</p>}
          </div> : <>
          <div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated px-3 py-2">
              <label htmlFor="pos-received" className="text-sm font-semibold text-muted">
                {receivedLabel}
              </label>
              <div className="flex items-center">
                <span className="mr-1 font-semibold text-muted">₹</span>
                <input
                  id="pos-received"
                  ref={paidInputRef}
                  type="text"
                  inputMode="decimal"
                  aria-label={receivedLabel}
                  className="w-28 bg-transparent text-right text-xl font-semibold tabular-nums outline-none"
                  placeholder={store.payment_mode === "credit" ? "0.00" : calculation.amountToCollect.toFixed(2)}
                  value={store.paid_amount}
                  onChange={(e) => store.setPaidAmount(e.target.value)}
                />
              </div>
            </div>
            <p className="mt-1.5 text-xs text-muted">{receivedHint}</p>
            {suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestions.map((amount, index) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => store.setPaidAmount(amount.toFixed(2))}
                    className="min-h-9 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-foreground hover:border-primary"
                  >
                    {index === 0 ? "Exact" : formatRupee(amount)}
                  </button>
                ))}
              </div>
            )}
            {calculation.changeDue > 0 && (
              <p className="mt-3 flex items-center justify-between rounded-lg bg-success/10 px-3 py-2 text-sm font-semibold text-success" aria-live="polite">
                <span>Change to return</span>
                <span className="tabular-nums">{formatRupee(calculation.changeDue)}</span>
              </p>
            )}
            {store.payment_mode === "credit" && calculation.balance_due > 0 && (
              <p className="mt-3 flex items-center justify-between rounded-lg bg-warning/10 px-3 py-2 text-sm font-semibold text-warning" aria-live="polite">
                <span>Will be added to credit</span>
                <span className="tabular-nums">{formatRupee(calculation.balance_due)}</span>
              </p>
            )}
            {confirmBlockedReason && (
              <p role="alert" className="mt-3 text-sm font-semibold text-danger">
                {confirmBlockedReason}
              </p>
            )}
          </div>

          </>}

          <div className="max-[480px]:hidden">
            <Button
              className="min-h-12 w-full text-base"
              variant="primary"
              onClick={() => void handleConfirm()}
              disabled={isCommitting || store.cart.length === 0 || Boolean(confirmBlockedReason)}
              isLoading={isCommitting}
              aria-keyshortcuts="Control+Enter"
              title={confirmBlockedReason || undefined}
            >
              <Check size={18} aria-hidden /> Confirm sale
            </Button>
            <p className="mt-2 text-center text-xs text-muted">Ctrl+Enter confirms from anywhere on this page</p>
          </div>
          </div>
        </Card>
      </aside>

      {store.cart.length > 0 && (
        <div
          className="fixed right-3 left-3 z-30 hidden max-[480px]:block"
          style={{ bottom: "calc(max(10px, env(safe-area-inset-bottom)) + 78px)" }}
        >
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-2 pl-4 shadow-2xl">
            <div className="min-w-0 flex-1">
              <p className={`truncate text-[11px] font-medium ${confirmBlockedReason ? "text-danger" : "text-muted"}`}>
                {confirmBlockedReason || `${unitCount} ${unitCount === 1 ? "unit" : "units"}`}
              </p>
              <p className="text-lg font-semibold text-primary tabular-nums">{formatRupee(calculation.payable)}</p>
            </div>
            <Button
              className="min-h-12 px-4"
              variant="primary"
              onClick={() => void handleConfirm()}
              disabled={isCommitting || Boolean(confirmBlockedReason)}
              isLoading={isCommitting}
            >
              <Check size={16} aria-hidden /> Confirm
            </Button>
          </div>
        </div>
      )}

      <UpiPaymentModals
        modal={upiModal}
        shopName={shopName}
        upiId={upiId}
        amount={pendingUpiAmount}
        qrValue={upiQrValue}
        isConfirming={isCommitting}
        onClose={closeUpiModal}
        onConfirmPayment={() => {
          closeUpiModal();
          void executeSale();
        }}
      />
    </fieldset>
  );
};
