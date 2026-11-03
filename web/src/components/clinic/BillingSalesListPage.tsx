import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Plus, Eye, Printer } from "lucide-react";
import api from "../../lib/api";
import type { Sale } from "../../core/types";

import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Badge } from "../ui/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/Table";
import toast from "react-hot-toast";
import { Modal } from "../ui/Modal";
import { formatInr } from "../../lib/formatInr";

type Row = Sale & {
  customerLabel: string;
  payment_status?: string;
  paid_amount?: number;
  balance_due?: number;
};
type InvoiceDetail = {
  invoice_number: string;
  net_amount: number;
  paid_amount: number;
  balance_due: number;
  sale_items: {
    id: string;
    quantity: number;
    unit_price: number;
    total: number;
    medicines?: { name?: string };
  }[];
};

function saleStatusVariant(
  status: Sale["status"],
): "success" | "danger" | "warning" {
  if (status === "COMPLETED") return "success";
  if (status === "CANCELLED") return "danger";
  return "warning";
}

const primaryLinkClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-on-primary px-5 py-2.5 font-extrabold uppercase tracking-widest text-xs shadow-md shadow-primary/20 border border-white/10 hover:brightness-110 transition-all";

export const BillingSalesListPage: React.FC = () => {
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const pageSize = 25;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(
      async () => {
        try {
          const params: Record<string, string | number> = {
            page,
            limit: pageSize,
            q: q.trim(),
          };
          if (from) params.from = new Date(`${from}T00:00:00`).toISOString();
          if (to) params.to = new Date(`${to}T23:59:59.999`).toISOString();
          const salesRes = await api.get("/sales", {
            params,
            signal: controller.signal,
          });
          const sales = salesRes.data?.data || [];
          const enriched: Row[] = sales.map((s: any) => ({
            ...s,
            final_amount: Number(s.final_amount ?? s.net_amount ?? 0),
            payment_mode: (s.payment_mode ?? "cash").toUpperCase(),
            status: s.is_return ? "REFUNDED" : "COMPLETED",
            payment_status: (s.payment_status ?? "paid").toLowerCase(),
            customerLabel: s.customer_id ? s.customers?.name || "—" : "Walk-in",
          }));
          if (!controller.signal.aborted) {
            setRows(enriched);
            setTotal(Number(salesRes.data?.pagination?.total || 0));
          }
        } catch {
          if (!controller.signal.aborted) {
            setRows([]);
            setTotal(0);
            setError("Unable to load invoices. Please retry.");
          }
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      q.trim() ? 150 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [page, q, from, to, retry]);

  const totals = useMemo(() => {
    const billed = rows.reduce(
      (a, r) =>
        a + (r.status === "REFUNDED" ? -r.final_amount : r.final_amount),
      0,
    );
    const received = rows.reduce(
      (sum, row) =>
        sum +
        (row.status === "REFUNDED" ? -1 : 1) *
          Number(
            row.paid_amount ??
              (row.payment_status === "paid" ? row.final_amount : 0),
          ),
      0,
    );
    const pending = rows
      .filter((row) => row.status === "COMPLETED")
      .reduce(
        (sum, row) =>
          sum +
          Number(
            row.balance_due ??
              Math.max(0, row.final_amount - Number(row.paid_amount || 0)),
          ),
        0,
      );
    return { billed, received, pending };
  }, [rows]);

  const handleView = async (sale: Sale) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/sales/${sale.id}`);
      setDetail(res.data.data);
    } catch {
      toast.error("Unable to open invoice. Please retry.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handlePrint = async (sale: Sale) => {
    try {
      const res = await api.get(`/sales/${sale.id}`);
      const items = res.data?.data?.sale_items || [];
      await (
        await import("../../services/printerService")
      ).PrinterService.printBill(sale, items);
    } catch (err) {
      console.error("Failed to print:", err);
      toast.error("Unable to print invoice. Please retry.");
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-slideIn">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground-strong tracking-tight">
            Sales & invoices
          </h1>
          <p className="text-sm text-muted mt-1">
            Invoices from your shop — search, print, and open POS for new bills.
          </p>
        </div>
        <Link to="/billing/new" className={primaryLinkClass}>
          <Plus className="w-4 h-4" />
          New invoice
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-label font-bold text-muted uppercase text-xs tracking-wider">
            Billed on this page
          </p>
          <p className="text-xl font-black tabular-nums mt-1">
            {formatInr(totals.billed, 2)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-label font-bold text-muted uppercase text-xs tracking-wider">
            Received on this page
          </p>
          <p className="text-xl font-black tabular-nums mt-1 text-success">
            {formatInr(totals.received, 2)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-label font-bold text-muted uppercase text-xs tracking-wider">
            Outstanding on this page
          </p>
          <p className="text-xl font-black tabular-nums mt-1 text-warning">
            {formatInr(totals.pending, 2)}
          </p>
        </Card>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <Input
            placeholder="Search invoice, customer, payment…"
            aria-label="Search invoices"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            icon="🔍"
            containerClassName="flex-1"
          />
          <div className="flex gap-2 flex-wrap">
            <Input
              type="date"
              aria-label="From date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              containerClassName="w-40"
              className="py-2.5"
            />
            <Input
              type="date"
              aria-label="To date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              containerClassName="w-40"
              className="py-2.5"
            />
          </div>
        </div>

        {error && (
          <div role="alert" className="text-sm text-danger">
            {error}{" "}
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
              className="underline"
            >
              Retry
            </button>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">
                Invoice
              </TableCell>
              <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">
                Customer
              </TableCell>
              <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">
                Date
              </TableCell>
              <TableCell className="text-muted font-bold uppercase text-xs tracking-wider text-right">
                Amount
              </TableCell>
              <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">
                Payment
              </TableCell>
              <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">
                Status
              </TableCell>
              <TableCell className="text-muted font-bold uppercase text-xs tracking-wider text-right">
                Actions
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted py-12">
                  Loading sales…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16">
                  <p className="text-muted font-medium mb-4">
                    No invoices match this view yet.
                  </p>
                  <Link to="/billing/new" className={primaryLinkClass}>
                    Start a sale in POS
                  </Link>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono font-bold">
                    {r.invoice_number}
                  </TableCell>
                  <TableCell>{r.customerLabel}</TableCell>
                  <TableCell className="text-muted text-sm">
                    {format(new Date(r.created_at), "dd MMM yyyy, HH:mm")}
                  </TableCell>
                  <TableCell className="text-right font-black tabular-nums">
                    {formatInr(r.final_amount, 2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="neutral">{r.payment_mode}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={saleStatusVariant(r.status)}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="p-2 rounded-lg text-muted hover:bg-surface-elevated hover:text-primary"
                        title="View"
                        aria-label={`View invoice ${r.invoice_number}`}
                        disabled={detailLoading}
                        onClick={() => void handleView(r)}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="p-2 rounded-lg text-muted hover:bg-surface-elevated hover:text-primary"
                        title="Print"
                        onClick={() => void handlePrint(r)}
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between text-sm text-muted">
          <span aria-live="polite">
            {total} invoices · Page {page} of{" "}
            {Math.max(1, Math.ceil(total / pageSize))}
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={loading || page <= 1}
              onClick={() => setPage((value) => value - 1)}
              className="disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={loading || page * pageSize >= total}
              onClick={() => setPage((value) => value + 1)}
              className="disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </Card>
      <Modal
        isOpen={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.invoice_number || "Invoice"}
      >
        {detail && (
          <div className="space-y-4">
            <p>
              Total {formatInr(detail.net_amount, 2)} · Received{" "}
              {formatInr(detail.paid_amount, 2)} · Due{" "}
              {formatInr(detail.balance_due, 2)}
            </p>
            <ul className="space-y-2">
              {(detail.sale_items || []).map((item) => (
                <li key={item.id} className="flex justify-between gap-4">
                  <span>
                    {item.medicines?.name || "Medicine"} × {item.quantity}
                  </span>
                  <span>{formatInr(item.total, 2)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
};
