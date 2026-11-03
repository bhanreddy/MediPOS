import React, { useId, useState } from "react";
import { Plus } from "lucide-react";
import toast from "react-hot-toast";
import { useDirectory } from "../../hooks/useDirectory";
import { LoadError, NoSearchResults, Pagination } from "../ui/ListFeedback";
import type { Customer } from "../../core/types";
import { CustomerService } from "../../services/customerService";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/Table";
import { formatInr } from "../../lib/formatInr";

export const CustomersListPage: React.FC = () => {
    const formId = useId();
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [creditLimit, setCreditLimit] = useState("");

  const { rows: filtered, loading, error, refresh, page, limit, total, setPage, fetching } = useDirectory<Customer>("/customers", q);

  const resetForm = () => {
    setName("");
    setPhone("");
    setEmail("");
    setCreditLimit("");
  };

  const openModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    resetForm();
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Customer name is required");
      return;
    }

    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      toast.error("Phone number is required");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(trimmedPhone)) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }

    const trimmedEmail = email.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Enter a valid email address");
      return;
    }

    const limitNum = creditLimit.trim() ? Number(creditLimit) : NaN;
    if (creditLimit.trim() && (!Number.isFinite(limitNum) || limitNum < 0)) {
      toast.error("Credit limit must be a valid amount");
      return;
    }

    setSaving(true);
    try {
      await CustomerService.addCustomer({
        name: trimmedName,
        phone: trimmedPhone,
        ...(trimmedEmail ? { email: trimmedEmail } : {}),
        credit_limit: Number.isFinite(limitNum) ? limitNum : 0,
      });
      await refresh();
      toast.success("Customer added");
      setModalOpen(false);
      resetForm();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ||
        (e instanceof Error ? e.message : "Failed to add customer");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-slideIn">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground-strong tracking-tight">
            Customers
          </h1>
          <p className="text-sm text-muted mt-1">
            Walk-in and registered buyers — credit balance is tracked at
            billing.
          </p>
        </div>
        <Button
          variant="secondary"
          type="button"
          className="whitespace-nowrap"
          onClick={openModal}
        >
          <Plus className="w-4 h-4 mr-2 inline" />
          Add customer
        </Button>
      </div>

      <Card className="p-4 space-y-4">
        <Input
          placeholder="Search name or phone…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          aria-label="Search customers"
          icon="🔍"
        />
        {error && <LoadError onRetry={() => void refresh()} />}
        <Table aria-busy={loading || fetching}>
          <TableHeader>
            <TableRow>
              <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">
                Name
              </TableCell>
              <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">
                Phone
              </TableCell>
              <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">
                Email
              </TableCell>
              <TableCell className="text-muted font-bold uppercase text-xs tracking-wider text-right">
                Credit limit
              </TableCell>
              <TableCell className="text-muted font-bold uppercase text-xs tracking-wider text-right">
                Due balance
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? null : loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted py-12">
                  Loading customers…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-16 text-muted">
                  {q.trim() ? <NoSearchResults onClear={() => { setQ(""); setPage(1); }} /> : <>
                  <p className="font-medium mb-2">No customers yet.</p>
                  <p className="text-sm">
                    Add a customer to track credit and purchase history.
                  </p></>}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id || c._local_id}>
                  <TableCell className="font-bold">{c.name}</TableCell>
                  <TableCell className="font-mono text-sm">{c.phone}</TableCell>
                  <TableCell className="text-muted text-sm">
                    {c.email || "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatInr(c.credit_limit ?? 0)}
                  </TableCell>
                  <TableCell className="text-right font-black tabular-nums text-warning">
                    {formatInr(c.outstanding_balance ?? c.credit_balance ?? 0)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {!error && <Pagination page={page} limit={limit} total={total} onPage={setPage} busy={loading || fetching} />}
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title="Add customer"
        footer={
          <>
            <Button
              variant="ghost"
              type="button"
              onClick={closeModal}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={formId}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save customer"}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={event => { event.preventDefault(); void handleSave(); }} className="space-y-4">
          <Input
            label="Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rajesh Kumar"
          />
          <Input
            label="Phone *"
            value={phone}
            onChange={(e) =>
              setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
            }
            placeholder="10-digit mobile"
            inputMode="numeric"
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="optional@email.com"
          />
          <Input
            label="Credit limit (₹)"
            value={creditLimit}
            onChange={(e) =>
              setCreditLimit(e.target.value.replace(/[^\d.]/g, ""))
            }
            placeholder="Optional — for due billing"
            inputMode="decimal"
          />
        </form>
      </Modal>
    </div>
  );
};
