import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Building2,
  Clock3,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Search,
  Wallet,
} from "lucide-react";
import toast from "react-hot-toast";
import { useDirectory } from "../../hooks/useDirectory";
import { useAuth } from "../../lib/auth";
import api from "../../lib/api";
import { formatInr } from "../../lib/formatInr";
import { LoadError, NoSearchResults, Pagination } from "../ui/ListFeedback";
import type { Supplier } from "../../core/types";
import { SupplierService } from "../../services/supplierService";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Modal } from "../ui/Modal";
import "../Procurement/procurementWorkspace.css";

const emptyForm = {
  name: "",
  gstin: "",
  phone: "",
  email: "",
  address: "",
  lead_time_days: 5,
  minimum_order_value: 0,
  preferred_channel: "MANUAL" as NonNullable<Supplier["preferred_channel"]>,
  whatsapp_opt_in: false,
  sms_opt_in: false,
  is_active: true,
};

export function SuppliersListPage() {
  const formId = useId();
  const owner = useAuth((state) => state.isOwner);
  const client = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const {
    rows,
    loading,
    error,
    refresh,
    page,
    limit,
    total,
    setPage,
    fetching,
  } = useDirectory<Supplier>("/suppliers", q, { filter });
  const summary = useQuery({
    queryKey: ["supplier-summary"],
    queryFn: async () =>
      (
        await api.get<{
          data: {
            total: number;
            active: number;
            outstanding: number;
            missing_contact: number;
          };
        }>("/suppliers/summary")
      ).data.data,
  });
  const openForm = (supplier?: Supplier) => {
    setEditing(supplier || null);
    setForm(
      supplier
        ? {
            name: supplier.name,
            gstin: supplier.gstin || "",
            phone: supplier.phone || "",
            email: supplier.email || "",
            address: supplier.address || "",
            lead_time_days: Number(supplier.lead_time_days || 5),
            minimum_order_value: Number(supplier.minimum_order_value || 0),
            preferred_channel: supplier.preferred_channel || "MANUAL",
            whatsapp_opt_in: !!supplier.whatsapp_opt_in,
            sms_opt_in: !!supplier.sms_opt_in,
            is_active: supplier.is_active !== false,
          }
        : emptyForm,
    );
    setFormError("");
    setOpen(true);
  };
  const save = async () => {
    if (saving) return;
    if (!form.name.trim()) {
      setFormError("Enter the supplier company name.");
      return;
    }
    if (form.phone && !/^[6-9]\d{9}$/.test(form.phone)) {
      setFormError("Enter a valid 10-digit mobile number.");
      return;
    }
    if (form.gstin && form.gstin.length !== 15) {
      setFormError("GSTIN must be 15 characters.");
      return;
    }
    if (
      form.preferred_channel !== "MANUAL" &&
      (!form.phone ||
        (form.preferred_channel === "WHATSAPP"
          ? !form.whatsapp_opt_in
          : !form.sms_opt_in))
    ) {
      setFormError(
        "Add a mobile number and record permission for the selected message channel.",
      );
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        phone: form.phone || null,
        gstin: form.gstin || null,
        email: form.email.trim() || null,
        address: form.address.trim(),
      };
      if (editing)
        await SupplierService.updateSupplier(
          editing.id,
          payload,
        );
      else await api.post("/suppliers", payload);
      await Promise.all([
        refresh(),
        client.invalidateQueries({ queryKey: ["supplier-summary"] }),
        client.invalidateQueries({ queryKey: ["reorder-workspace"] }),
        client.invalidateQueries({ queryKey: ["purchase-suppliers"] }),
      ]);
      toast.success(editing ? "Supplier updated" : "Supplier added");
      setOpen(false);
    } catch (err) {
      const body = (
        err as {
          response?: { data?: { error?: string | { message?: string } } };
        }
      ).response?.data?.error;
      setFormError(
        typeof body === "string"
          ? body
          : body?.message || "Could not save supplier. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };
  const stats = summary.data;
  return (
    <div className="supply-workspace space-y-6 animate-slideIn">
      <header className="supply-heading">
        <div>
          <div className="supply-eyebrow">
            <Building2 size={14} /> PROCUREMENT / SUPPLIERS
          </div>
          <h1>Your supply network</h1>
          <p>
            Keep reliable contacts, plan delivery times, and make every order
            easier.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="supply-link-button" to="/inventory/reorder">
            Plan a reorder <ArrowUpRight size={16} />
          </Link>
          {owner && (
            <Button onClick={() => openForm()}>
              <Plus size={16} /> Add supplier
            </Button>
          )}
        </div>
      </header>
      <div className="supply-metrics">
        <div>
          <span>
            <Building2 size={16} /> Active suppliers
          </span>
          <strong>
            {stats ? stats.active : "—"}
            <small> / {stats?.total ?? "—"} total</small>
          </strong>
          <p>Your available purchasing partners</p>
        </div>
        <div>
          <span>
            <Wallet size={16} /> Supplier payable
          </span>
          <strong>{stats ? formatInr(stats.outstanding, 2) : "—"}</strong>
          <p>Recorded outstanding balance</p>
        </div>
        <div>
          <span>
            <Phone size={16} /> Contacts to complete
          </span>
          <strong>{stats?.missing_contact ?? "—"}</strong>
          <p>Add mobile numbers to simplify follow-ups</p>
        </div>
      </div>
      {summary.isError && (
        <div className="supply-notice">
          <span>Supplier totals could not load.</span>
          <button onClick={() => void summary.refetch()}>Try again</button>
        </div>
      )}
      <section className="supply-panel">
        <div className="supply-panel-heading">
          <div>
            <h2>Supplier directory</h2>
            <p>Contact details and buying preferences, together.</p>
          </div>
          <span className="supply-count">{total} suppliers</span>
        </div>
        <div className="supply-toolbar">
          <div className="supply-search">
            <Search size={17} />
            <input
              aria-label="Search suppliers"
              placeholder="Search name, mobile, GSTIN or email…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="supply-segments" aria-label="Filter suppliers">
            {[
              ["all", "All suppliers"],
              ["active", "Active"],
              ["missing_contact", "Missing mobile"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                onClick={() => {
                  setFilter(value);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {error ? (
          <div className="p-5">
            <LoadError onRetry={() => void refresh()} />
          </div>
        ) : (
          <div className="supply-directory" aria-busy={loading || fetching}>
            <div className="supply-directory-head">
              <span>Supplier</span>
              <span>Contact</span>
              <span>Delivery & messaging</span>
              <span>Payable</span>
              <span>Manage</span>
            </div>
            {loading ? (
              <div className="supply-empty" role="status">
                Loading your suppliers…
              </div>
            ) : rows.length === 0 ? (
              <div className="supply-empty">
                {q ? (
                  <NoSearchResults
                    onClear={() => {
                      setQ("");
                      setPage(1);
                    }}
                  />
                ) : (
                  <>
                    <Building2 size={30} />
                    <h3>
                      {filter === "missing_contact"
                        ? "Your supplier contacts are complete"
                        : filter === "active"
                          ? "No active suppliers"
                          : "Start with your first supplier"}
                    </h3>
                    <p>
                      {filter === "missing_contact"
                        ? "All active suppliers have a mobile number."
                        : "Add a distributor and their delivery preferences to start planning orders."}
                    </p>
                    {owner && filter !== "missing_contact" && (
                      <Button onClick={() => openForm()}>Add supplier</Button>
                    )}
                  </>
                )}
              </div>
            ) : (
              rows.map((s) => (
                <article key={s.id} className="supply-directory-row">
                  <div className="supply-company">
                    <span className="supply-avatar">
                      {s.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <strong>{s.name}</strong>
                      <p>{s.gstin || "GSTIN not added"}</p>
                      <span
                        className={`supply-pill ${s.is_active !== false ? "success" : "neutral"}`}
                      >
                        {s.is_active !== false ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                  <div className="supply-contact">
                    {s.phone ? (
                      <a href={`tel:+91${s.phone}`}>
                        <Phone size={13} /> {s.phone}
                      </a>
                    ) : (
                      <span className="text-warning">Mobile not added</span>
                    )}
                    {s.email && (
                      <a href={`mailto:${s.email}`}>
                        <Mail size={13} />
                        <span className="truncate">{s.email}</span>
                      </a>
                    )}
                  </div>
                  <div className="supply-delivery">
                    <span>
                      <Clock3 size={13} /> {s.lead_time_days || 5} day lead time
                    </span>
                    <small>
                      {s.preferred_channel === "WHATSAPP"
                        ? "WhatsApp preferred"
                        : s.preferred_channel === "SMS"
                          ? "SMS preferred"
                          : "Manual follow-up"}
                    </small>
                  </div>
                  <div className="supply-payable">
                    <span className="supply-mobile-label">Payable</span>
                    {formatInr(s.outstanding_balance, 2)}
                  </div>
                  <div>
                    {owner ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openForm(s)}
                        aria-label={`Edit ${s.name}`}
                      >
                        <Pencil size={14} /> Edit
                      </Button>
                    ) : (
                      <span className="text-xs text-muted">View only</span>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        )}
        {!error && (
          <div className="p-4 border-t border-border">
            <Pagination
              page={page}
              limit={limit}
              total={total}
              onPage={setPage}
              busy={loading || fetching}
            />
          </div>
        )}
      </section>
      <div className="supply-note">
        <MessageSquare size={19} />
        <div>
          <strong>Ready for your next connection</strong>
          <p>
            Save channel preferences and permissions now. WhatsApp and SMS
            automation can connect later; messages are currently prepared for
            manual review.
          </p>
        </div>
      </div>
      <Modal
        isOpen={open}
        onClose={() => {
          if (!saving) setOpen(false);
        }}
        title={editing ? "Edit supplier" : "Add supplier"}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" form={formId} disabled={saving}>
              {saving ? "Saving…" : "Save supplier"}
            </Button>
          </>
        }
      >
        <form
          id={formId}
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {formError && (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          )}
          <Input
            label="Company name *"
            required
            autoFocus
            maxLength={200}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Sri Sai Distributors"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Mobile number"
              type="tel"
              inputMode="tel"
              value={form.phone}
              maxLength={10}
              onChange={(e) =>
                setForm({
                  ...form,
                  phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                })
              }
              placeholder="10-digit mobile"
            />
            <Input
              label="GSTIN"
              value={form.gstin}
              maxLength={15}
              onChange={(e) =>
                setForm({ ...form, gstin: e.target.value.toUpperCase() })
              }
            />
          </div>
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label="Address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <div className="supply-form-section">
            <h3>Buying preferences</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Lead time (days)"
                type="number"
                min={1}
                max={90}
                required
                value={form.lead_time_days}
                onChange={(e) =>
                  setForm({ ...form, lead_time_days: Number(e.target.value) })
                }
              />
              <Input
                label="Minimum order value (₹)"
                type="number"
                min={0}
                step="0.01"
                required
                value={form.minimum_order_value}
                onChange={(e) =>
                  setForm({
                    ...form,
                    minimum_order_value: Number(e.target.value),
                  })
                }
              />
            </div>
            <p>Used to plan ahead and flag small orders before you save.</p>
          </div>
          <div className="supply-form-section">
            <h3>Messaging preferences</h3>
            <Select
              label="Preferred channel"
              value={form.preferred_channel}
              options={[
                { value: "MANUAL", label: "Manual follow-up" },
                { value: "WHATSAPP", label: "WhatsApp (future integration)" },
                { value: "SMS", label: "SMS (future integration)" },
              ]}
              onChange={(e) =>
                setForm({
                  ...form,
                  preferred_channel: e.target
                    .value as typeof form.preferred_channel,
                })
              }
            />
            <label className="supply-checkbox">
              <input
                type="checkbox"
                checked={form.whatsapp_opt_in}
                onChange={(e) =>
                  setForm({ ...form, whatsapp_opt_in: e.target.checked })
                }
              />{" "}
              Supplier agreed to WhatsApp order updates
            </label>
            <label className="supply-checkbox">
              <input
                type="checkbox"
                checked={form.sms_opt_in}
                onChange={(e) =>
                  setForm({ ...form, sms_opt_in: e.target.checked })
                }
              />{" "}
              Supplier agreed to SMS order updates
            </label>
            <p>Preferences only. No messages will be sent.</p>
          </div>
          {editing && (
            <label className="supply-checkbox">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm({ ...form, is_active: e.target.checked })
                }
              />{" "}
              Active supplier — available for new orders
            </label>
          )}
        </form>
      </Modal>
    </div>
  );
}
