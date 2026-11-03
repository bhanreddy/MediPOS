import React, { useId, useState } from "react";
import { Plus } from "lucide-react";
import toast from "react-hot-toast";
import { useDirectory } from "../../hooks/useDirectory";
import { LoadError, NoSearchResults, Pagination } from "../ui/ListFeedback";
import type { Supplier } from "../../core/types";
import { SupplierService } from "../../services/supplierService";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Badge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/Table";

export const SuppliersListPage: React.FC = () => {
    const formId = useId();
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const { rows: filtered, loading, error, refresh, page, limit, total, setPage, fetching } = useDirectory<Supplier>("/suppliers", q);

  const resetForm = () => {
    setName("");
    setGstin("");
    setPhone("");
    setEmail("");
    setAddress("");
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
      toast.error("Company name is required");
      return;
    }

    const trimmedPhone = phone.trim();
    if (trimmedPhone && !/^[6-9]\d{9}$/.test(trimmedPhone)) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }

    const trimmedGstin = gstin.trim();
    if (trimmedGstin && trimmedGstin.length !== 15) {
      toast.error("GSTIN must be 15 characters");
      return;
    }

    setSaving(true);
    try {
      await SupplierService.addSupplier({
        name: trimmedName,
        ...(trimmedGstin ? { gstin: trimmedGstin } : {}),
        ...(trimmedPhone ? { phone: trimmedPhone } : {}),
        address: address.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      await refresh();
      toast.success("Supplier added");
      setModalOpen(false);
      resetForm();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ||
        (e instanceof Error ? e.message : "Failed to add supplier");
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
            Suppliers
          </h1>
          <p className="text-sm text-muted mt-1">
            Distributors linked to purchase inward and GST.
          </p>
        </div>
        <Button
          variant="secondary"
          type="button"
          className="whitespace-nowrap"
          onClick={openModal}
        >
          <Plus className="w-4 h-4 mr-2 inline" />
          Add supplier
        </Button>
      </div>

      <Card className="p-4 space-y-4">
        <Input
          placeholder="Search company, GSTIN, phone…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          aria-label="Search suppliers"
          icon="🔍"
        />
        {error && <LoadError onRetry={() => void refresh()} />}
        <Table aria-busy={loading || fetching}>
          <TableHeader>
            <TableRow>
              <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">
                Company
              </TableCell>
              <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">
                GSTIN
              </TableCell>
              <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">
                Phone
              </TableCell>
              <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">
                Email
              </TableCell>
              <TableCell className="text-muted font-bold uppercase text-xs tracking-wider">
                Status
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? null : loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted py-12">
                  Loading suppliers…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-16 text-muted">
                  {q.trim() ? <NoSearchResults onClear={() => { setQ(""); setPage(1); }} /> : <>
                  <p className="font-medium mb-2">No suppliers yet.</p>
                  <p className="text-sm">
                    Add vendors before recording purchases.
                  </p></>}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-bold">{s.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {s.gstin || "—"}
                  </TableCell>
                  <TableCell className="text-sm">{s.phone || "—"}</TableCell>
                  <TableCell className="text-muted text-sm">
                    {s.email || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.is_active ? "success" : "neutral"}>
                      {s.is_active ? "Active" : "Inactive"}
                    </Badge>
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
        title="Add supplier"
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
              {saving ? "Saving…" : "Save supplier"}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={event => { event.preventDefault(); void handleSave(); }} className="space-y-4">
          <Input
            label="Company name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cipla Distributors"
          />
          <Input
            label="GSTIN"
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            placeholder="15-character GSTIN"
            maxLength={15}
          />
          <Input
            label="Phone"
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
            placeholder="accounts@vendor.com"
          />
          <Input
            label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="City, state"
          />
        </form>
      </Modal>
    </div>
  );
};
