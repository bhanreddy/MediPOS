import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ClipboardCopy,
  ClipboardList,
  Clock3,
  PackageCheck,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Truck,
  Wallet,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../lib/auth";
import { formatInr } from "../../lib/formatInr";
import {
  ReorderService,
  type ReorderDraft,
  type ReorderDraftInput,
} from "../../services/reorderService";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { LoadError } from "../ui/ListFeedback";
import "../Procurement/procurementWorkspace.css";

type Edit = { selected: boolean; quantity: number; supplierId: string };
function errorMessage(err: unknown) {
  const body = (
    err as { response?: { data?: { error?: string | { message?: string } } } }
  ).response?.data?.error;
  return typeof body === "string"
    ? body
    : body?.message || "Could not save the order drafts. Please try again.";
}
export function ReorderShortbookPage() {
  const owner = useAuth((state) => state.isOwner);
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<"plan" | "orders">(
    params.get("tab") === "orders" ? "orders" : "plan",
  );
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("all");
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [preview, setPreview] = useState<ReorderDraft | null>(null);
  const [cancelOrder, setCancelOrder] = useState<ReorderDraft | null>(null);
  const pending = useRef<{
    signature: string;
    input: ReorderDraftInput;
  } | null>(null);
  const committing = useRef(false);
  const workspace = useQuery({
    queryKey: ["reorder-workspace"],
    queryFn: ({ signal }) => ReorderService.workspace(signal),
    staleTime: 30000,
  });
  const drafts = useQuery({
    queryKey: ["reorder-drafts"],
    queryFn: () => ReorderService.drafts(),
  });
  const suppliers = workspace.data?.suppliers ?? [];
  const supplierFilter = params.get("supplier") || "";
  const rows = useMemo(
    () =>
      (workspace.data?.candidates ?? []).map((row) => {
        const edit = edits[row.medicineId] || {
          selected: false,
          quantity: row.recommendedQuantity,
          supplierId: row.supplierId,
        };
        const price =
          row.quotes.find((quote) => quote.supplier_id === edit.supplierId)
            ?.price ?? null;
        return { ...row, ...edit, price };
      }),
    [workspace.data, edits],
  );
  const selected = rows.filter(
    (row) => row.selected && row.recommendedQuantity > 0,
  );
  const visible = rows.filter(
    (row) =>
      (!supplierFilter || row.supplierId === supplierFilter) &&
      (priority === "all" ||
        (priority === "shortbook"
          ? row.requestedQuantity > 0
          : priority === "covered"
            ? row.recommendedQuantity === 0
            : row.priority === priority && row.recommendedQuantity > 0)) &&
      `${row.medicineName} ${row.genericName}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const groups = suppliers
    .map((supplier) => {
      const lines = selected.filter((row) => row.supplierId === supplier.id);
      return {
        supplier,
        lines,
        total:
          lines.reduce(
            (sum, row) =>
              sum + Math.round((row.price ?? 0) * 100) * row.quantity,
            0,
          ) / 100,
        unknown: lines.some((row) => row.price == null),
      };
    })
    .filter((group) => group.lines.length);
  const estimate =
    selected.reduce(
      (sum, row) => sum + Math.round((row.price ?? 0) * 100) * row.quantity,
      0,
    ) / 100;
  const unknown = selected.filter((row) => row.price == null).length;
  const unassigned = selected.filter(
    (row) => !row.supplierId || !suppliers.some((s) => s.id === row.supplierId),
  ).length;
  const invalidQuantity = selected.some(
    (row) =>
      !Number.isInteger(row.quantity) ||
      row.quantity <= 0 ||
      row.quantity > row.recommendedQuantity,
  );
  const hasBudget = budget.trim() !== "";
  const invalidBudget =
    hasBudget && (!Number.isFinite(Number(budget)) || Number(budget) <= 0);
  const overBudget = hasBudget && estimate > Number(budget);
  const ready =
    selected.length > 0 &&
    !unassigned &&
    !invalidQuantity &&
    !invalidBudget &&
    !overBudget &&
    !(hasBudget && unknown > 0) &&
    !workspace.isFetching &&
    !workspace.isError;
  const critical = rows.filter(
    (row) => row.priority === "critical" && row.recommendedQuantity > 0,
  ).length;
  const patch = (id: string, update: Partial<Edit>) => {
    const row = rows.find((item) => item.medicineId === id)!;
    setEdits((previous) => ({
      ...previous,
      [id]: {
        selected: row.selected,
        quantity: row.quantity,
        supplierId: row.supplierId,
        ...update,
      },
    }));
  };
  const selectVisible = () =>
    setEdits((previous) => {
      const next = { ...previous };
      for (const row of visible.filter((item) => item.recommendedQuantity > 0))
        next[row.medicineId] = {
          selected: true,
          quantity: row.quantity,
          supplierId: row.supplierId,
        };
      return next;
    });
  const refresh = async () => {
    await Promise.all([workspace.refetch(), drafts.refetch()]);
  };
  const changeTab = (next: "plan" | "orders") => {
    setTab(next);
    setParams((previous) => {
      previous.set("tab", next);
      return previous;
    });
  };
  const save = async () => {
    if (!ready || committing.current) return;
    committing.current = true;
    setSaving(true);
    setSaveError("");
    const payload = {
      notes,
      ...(hasBudget ? { budget: Number(budget) } : {}),
      lines: selected.map((row) => ({
        medicine_id: row.medicineId,
        supplier_id: row.supplierId,
        quantity: row.quantity,
      })),
    };
    const signature = JSON.stringify(payload);
    if (pending.current?.signature !== signature)
      pending.current = {
        signature,
        input: { ...payload, request_id: crypto.randomUUID() },
      };
    try {
      const saved = await ReorderService.createDrafts(pending.current!.input);
      pending.current = null;
      setReview(false);
      setEdits({});
      setNotes("");
      changeTab("orders");
      toast.success(
        `${saved.length} supplier ${saved.length === 1 ? "draft" : "drafts"} saved`,
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: ["reorder-workspace"] }),
        client.invalidateQueries({ queryKey: ["reorder-drafts"] }),
        client.invalidateQueries({ queryKey: ["clinic-header-alerts"] }),
      ]);
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      committing.current = false;
      setSaving(false);
    }
  };
  const copyMessage = async (draft: ReorderDraft) => {
    try {
      await navigator.clipboard.writeText(draft.body);
      toast.success("Order message copied");
    } catch {
      toast.error("Clipboard unavailable. Select and copy the message text.");
    }
  };
  const cancel = async () => {
    if (!cancelOrder || saving) return;
    setSaving(true);
    try {
      await ReorderService.cancelDraft(cancelOrder.id);
      setCancelOrder(null);
      toast.success("Draft cancelled. Quantities are available to plan again.");
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="supply-workspace space-y-6 animate-slideIn">
      <header className="supply-heading">
        <div>
          <div className="supply-eyebrow">
            <ShoppingBag size={14} /> PROCUREMENT / REORDER
          </div>
          <h1>
            Buy what you need.
            <br className="sm:hidden" /> Keep cash moving.
          </h1>
          <p>
            A clear plan for your next order, from low stock to supplier-ready
            drafts.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/suppliers" className="supply-link-button">
            Suppliers <ArrowRight size={15} />
          </Link>
          <Button
            variant="secondary"
            onClick={() => void refresh()}
            disabled={workspace.isFetching || saving}
            aria-label="Refresh reorder plan"
          >
            <RefreshCw
              size={15}
              className={workspace.isFetching ? "animate-spin" : ""}
            />{" "}
            Refresh
          </Button>
        </div>
      </header>
      <div className="supply-metrics">
        <div>
          <span>
            <ShoppingBag size={16} /> Needs replenishment
          </span>
          <strong>
            {workspace.data
              ? rows.filter((row) => row.recommendedQuantity > 0).length
              : "—"}
          </strong>
          <p>Based on stock, demand & open orders</p>
        </div>
        <div className={critical ? "supply-metric-alert" : ""}>
          <span>
            <Clock3 size={16} /> Out of stock
          </span>
          <strong>{workspace.data ? critical : "—"}</strong>
          <p>Prioritize these medicines first</p>
        </div>
        <div>
          <span>
            <PackageCheck size={16} /> Orders already in progress
          </span>
          <strong>{workspace.data?.openOrderCount ?? "—"}</strong>
          <p>Drafts included to avoid duplicate buying</p>
        </div>
      </div>
      <div className="supply-tabs" aria-label="Reorder views">
        <button aria-pressed={tab === "plan"} onClick={() => changeTab("plan")}>
          <ClipboardList size={16} /> Reorder plan
        </button>
        <button
          aria-pressed={tab === "orders"}
          onClick={() => changeTab("orders")}
        >
          <Truck size={16} /> Saved orders{" "}
          <span>
            {drafts.data?.filter(
              (d) => d.status !== "CANCELLED" && d.status !== "CLOSED",
            ).length ?? "—"}
          </span>
        </button>
      </div>
      {tab === "plan" ? (
        workspace.isError ? (
          <LoadError onRetry={() => void workspace.refetch()} />
        ) : (
          <div className="supply-plan-layout">
            <section className="supply-panel min-w-0">
              <div className="supply-panel-heading">
                <div>
                  <h2>Your buying queue</h2>
                  <p>
                    Review quantities in stock units. Select only what you want
                    to order.
                  </p>
                </div>
              </div>
              <div className="supply-toolbar flex-wrap">
                <div className="supply-search">
                  <Search size={16} />
                  <input
                    placeholder="Find a medicine or generic…"
                    aria-label="Search reorder medicines"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  className="supply-select"
                  aria-label="Filter reorder priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="all">All priorities</option>
                  <option value="critical">Out of stock</option>
                  <option value="urgent">Order soon</option>
                  <option value="planned">Planned</option>
                  <option value="shortbook">Shortbook requests</option>
                  <option value="covered">Covered by orders</option>
                </select>
              </div>
              {supplierFilter && (
                <div className="supply-notice">
                  <span>
                    Filtered to{" "}
                    {suppliers.find((s) => s.id === supplierFilter)?.name ||
                      "selected supplier"}
                  </span>
                  <button
                    onClick={() =>
                      setParams((previous) => {
                        previous.delete("supplier");
                        return previous;
                      })
                    }
                  >
                    Clear filter <X size={12} />
                  </button>
                </div>
              )}
              <div className="supply-queue-tools">
                <span>{visible.length} medicines</span>
                {owner && (
                  <button
                    disabled={
                      workspace.isPending ||
                      !visible.some((row) => row.recommendedQuantity > 0)
                    }
                    onClick={selectVisible}
                  >
                    <CheckCheck size={14} /> Select visible
                  </button>
                )}
              </div>
              {workspace.isPending ? (
                <div className="supply-empty" role="status">
                  Preparing your buying plan…
                </div>
              ) : visible.length === 0 ? (
                <div className="supply-empty">
                  <PackageCheck size={34} />
                  <h3>
                    {search || priority !== "all" || supplierFilter
                      ? "No medicines match these filters"
                      : "Your buying queue is clear"}
                  </h3>
                  <p>
                    {search || priority !== "all"
                      ? "Try another search or priority."
                      : "Medicines appear here when stock is low or a shortbook request is added."}
                  </p>
                </div>
              ) : (
                <div className="supply-reorder-list">
                  {visible.map((row) => (
                    <article
                      key={row.medicineId}
                      className={`supply-reorder-item ${row.selected ? "is-selected" : ""}`}
                    >
                      <div className="supply-item-top">
                        {owner && (
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.medicineName}`}
                            checked={
                              row.selected && row.recommendedQuantity > 0
                            }
                            disabled={row.recommendedQuantity === 0 || saving}
                            onChange={(e) =>
                              patch(row.medicineId, {
                                selected: e.target.checked,
                              })
                            }
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <h3>{row.medicineName}</h3>
                          <p>{row.genericName || row.reason}</p>
                        </div>
                        <span
                          className={`supply-pill ${row.recommendedQuantity === 0 ? "success" : row.priority === "critical" ? "danger" : row.priority === "urgent" ? "warning" : "neutral"}`}
                        >
                          {row.recommendedQuantity === 0
                            ? "Covered by orders"
                            : row.priority === "critical"
                              ? "Out of stock"
                              : row.priority === "urgent"
                                ? "Order soon"
                                : "Planned"}
                        </span>
                      </div>
                      <div className="supply-stock-facts">
                        <span>
                          <b>{row.availableStock}</b> available
                        </span>
                        <span>
                          <b>
                            {row.daysCover == null ? "—" : `${row.daysCover}d`}
                          </b>{" "}
                          cover
                        </span>
                        <span>
                          <b>{row.incomingStock}</b> on order
                        </span>
                        <span>
                          <b>{row.dailyDemand.toFixed(1)}</b> / day
                        </span>
                        {row.requestedQuantity > 0 && (
                          <span className="text-primary">
                            Shortbook: {row.requestedQuantity}
                          </span>
                        )}
                      </div>
                      {row.recommendedQuantity > 0 && (
                        <div className="supply-item-controls">
                          <label className="supply-supplier-control">
                            <span>Supplier · recorded rate</span>
                            <select
                              value={row.supplierId}
                              disabled={!owner || saving}
                              onChange={(e) =>
                                patch(row.medicineId, {
                                  supplierId: e.target.value,
                                })
                              }
                            >
                              <option value="">Choose supplier…</option>
                              {suppliers.map((s) => {
                                const quote = row.quotes.find(
                                  (q) => q.supplier_id === s.id,
                                );
                                return (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                    {quote
                                      ? ` · ${formatInr(quote.price, 2)}`
                                      : " · rate needed"}
                                  </option>
                                );
                              })}
                            </select>
                          </label>
                          <label className="supply-quantity-control">
                            <span>Qty · {row.unit}</span>
                            <input
                              aria-label={`Order quantity for ${row.medicineName}`}
                              type="number"
                              min={1}
                              max={row.recommendedQuantity}
                              step={1}
                              value={row.quantity}
                              disabled={!owner || saving}
                              onChange={(e) =>
                                patch(row.medicineId, {
                                  quantity: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <div className="supply-line-total">
                            <span>Est. cost</span>
                            <strong>
                              {row.price == null
                                ? "Rate needed"
                                : formatInr(row.price * row.quantity, 2)}
                            </strong>
                          </div>
                        </div>
                      )}
                      <div className="supply-item-foot">
                        <span>
                          Suggested {row.recommendedQuantity} {row.unit} ·{" "}
                          {row.leadTimeDays}d planning lead time
                        </span>
                        {row.quotes.length > 1 &&
                          row.supplierId !== row.quotes[0].supplier_id && (
                            <button
                              disabled={!owner || saving}
                              onClick={() =>
                                patch(row.medicineId, {
                                  supplierId: row.quotes[0].supplier_id,
                                })
                              }
                            >
                              <Sparkles size={12} /> Use lowest recorded rate
                            </button>
                          )}
                      </div>
                      {row.quotes.find(
                        (q) => q.supplier_id === row.supplierId,
                      ) && (
                        <p className="supply-rate-date">
                          Rate recorded{" "}
                          {new Date(
                            row.quotes.find(
                              (q) => q.supplier_id === row.supplierId,
                            )!.observed_at,
                          ).toLocaleDateString("en-IN")}
                          ; confirm current price and pack with supplier.
                        </p>
                      )}
                      {row.expiringStock > 0 && (
                        <p className="supply-expiry-note">
                          {row.expiringStock} stock units expire within 60 days.
                          Review these before buying more.
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
            <aside className="supply-order-summary">
              <div className="supply-panel">
                <div className="supply-panel-heading">
                  <div>
                    <div className="supply-eyebrow">
                      <Wallet size={14} /> ORDER PLANNER
                    </div>
                    <h2>Make the spend count</h2>
                  </div>
                </div>
                <div className="p-5 space-y-5">
                  <div className="supply-estimate">
                    <span>Estimated purchase cost</span>
                    <strong>
                      {formatInr(estimate, 2)}
                      {unknown > 0 && <small> + {unknown} unpriced</small>}
                    </strong>
                    <p>Before taxes, schemes & delivery charges</p>
                  </div>
                  <label className="supply-budget">
                    <span>Item budget (optional)</span>
                    <div>
                      <span>₹</span>
                      <input
                        aria-label="Purchase item budget"
                        placeholder="Set a limit"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                      />
                    </div>
                  </label>
                  {hasBudget && !invalidBudget && (
                    <p
                      className={
                        overBudget || unknown > 0
                          ? "supply-validation"
                          : "text-xs text-success"
                      }
                    >
                      {unknown
                        ? "Budget needs a recorded rate for every selected item."
                        : overBudget
                          ? `${formatInr(estimate - Number(budget), 2)} over your item budget`
                          : `${formatInr(Number(budget) - estimate, 2)} left in item budget`}
                    </p>
                  )}
                  <div className="supply-summary-groups">
                    <span>
                      {selected.length} medicines · {groups.length} supplier
                      orders
                    </span>
                    {groups.map((group) => (
                      <div key={group.supplier.id}>
                        <div>
                          <strong>{group.supplier.name}</strong>
                          <span>
                            {formatInr(group.total, 2)}
                            {group.unknown ? " + unpriced" : ""}
                          </span>
                        </div>
                        <p>
                          {group.lines.length} items ·{" "}
                          {group.supplier.lead_time_days || 5}d delivery lead
                          time
                        </p>
                        {Number(group.supplier.minimum_order_value) >
                          group.total && (
                          <p className="text-warning">
                            Below{" "}
                            {formatInr(group.supplier.minimum_order_value)}{" "}
                            minimum order. Confirm delivery charges.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <label className="supply-notes">
                    <span>Instructions for all suppliers</span>
                    <textarea
                      rows={2}
                      maxLength={1000}
                      placeholder="e.g. Confirm expiry and availability"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </label>
                  {unassigned > 0 && (
                    <p className="supply-validation">
                      Choose a supplier for {unassigned} selected{" "}
                      {unassigned === 1 ? "medicine" : "medicines"}.
                    </p>
                  )}
                  {invalidQuantity && (
                    <p className="supply-validation">
                      Quantities must be whole numbers between 1 and the
                      suggested quantity.
                    </p>
                  )}
                  {invalidBudget && (
                    <p className="supply-validation">
                      Enter a positive budget or leave it blank.
                    </p>
                  )}
                  {owner ? (
                    <>
                      <Button
                        className="w-full"
                        disabled={!ready || saving}
                        onClick={() => {
                          setSaveError("");
                          setReview(true);
                        }}
                      >
                        Review{" "}
                        {groups.length > 1
                          ? `${groups.length} orders`
                          : "order"}{" "}
                        <ArrowRight size={15} />
                      </Button>
                      {selected.length > 0 && (
                        <button
                          className="supply-clear"
                          onClick={() => setEdits({})}
                        >
                          Clear selection
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted">
                      An owner can create supplier orders.
                    </p>
                  )}
                  <div className="supply-summary-hint">
                    <Check size={15} />
                    <span>
                      Saving creates drafts and prepares messages for review.
                    </span>
                  </div>
                </div>
              </div>
              <p className="supply-planning-note">
                Forecast: last 30 days of sales, supplier lead time, 14 days of
                cover and minimum stock. Pending drafts reduce new suggestions.
                Quantities stay in your inventory stock unit.
              </p>
            </aside>
          </div>
        )
      ) : (
        <section className="supply-panel">
          <div className="supply-panel-heading">
            <div>
              <h2>Supplier order drafts</h2>
              <p>
                Your latest 100 saved orders. Copy a message or record stock
                when it arrives.
              </p>
            </div>
          </div>
          {drafts.isError ? (
            <LoadError onRetry={() => void drafts.refetch()} />
          ) : drafts.isPending ? (
            <div className="supply-empty" role="status">
              Loading supplier orders…
            </div>
          ) : !drafts.data?.length ? (
            <div className="supply-empty">
              <ClipboardList size={32} />
              <h3>No supplier orders yet</h3>
              <p>
                Select medicines in your reorder plan to prepare your first
                order.
              </p>
              <Button variant="secondary" onClick={() => changeTab("plan")}>
                Open reorder plan
              </Button>
            </div>
          ) : (
            <div className="supply-drafts">
              {drafts.data.map((draft) => (
                <article key={draft.id}>
                  <div>
                    <span
                      className={`supply-pill ${draft.status === "CLOSED" ? "success" : draft.status === "CANCELLED" ? "neutral" : "warning"}`}
                    >
                      {draft.status === "CLOSED"
                        ? "Received"
                        : draft.status === "CANCELLED"
                          ? "Cancelled"
                          : draft.status === "PARTIAL"
                            ? "Part received"
                            : draft.status === "SENT"
                              ? "Sent order"
                              : "Draft order"}
                    </span>
                    <h3>{draft.supplier_name}</h3>
                    <p>
                      {draft.po_number} ·{" "}
                      {draft.channel === "MANUAL"
                        ? "Manual follow-up"
                        : `${draft.channel === "SMS" ? "SMS" : "WhatsApp"} preferred`}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPreview(draft)}
                    >
                      <ClipboardCopy size={14} /> Message
                    </Button>
                    {owner &&
                      ["DRAFT", "SENT", "PARTIAL"].includes(draft.status) && (
                        <>
                          <Link
                            className="supply-link-button"
                            to={`/purchases/new?order=${draft.id}`}
                          >
                            Receive stock <ArrowRight size={14} />
                          </Link>
                          {["DRAFT", "SENT", "PARTIAL"].includes(
                            draft.status,
                          ) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setCancelOrder(draft)}
                            >
                              {draft.status === "PARTIAL"
                                ? "Cancel remaining"
                                : "Cancel order"}
                            </Button>
                          )}
                        </>
                      )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      <Modal
        isOpen={review}
        onClose={() => {
          if (!saving) setReview(false);
        }}
        title="Review supplier orders"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => setReview(false)}
            >
              Back to plan
            </Button>
            {saveError && (
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() => {
                  setReview(false);
                  void workspace.refetch();
                }}
              >
                Refresh plan
              </Button>
            )}
            <Button disabled={!ready || saving} onClick={() => void save()}>
              {saving
                ? "Saving…"
                : `Save ${groups.length} ${groups.length === 1 ? "draft" : "drafts"}`}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <p className="text-sm text-muted">
            Review your quantities and suppliers. Each supplier gets a separate
            order draft and message preview.
          </p>
          {groups.map((group) => (
            <div key={group.supplier.id} className="supply-review-group">
              <h3>{group.supplier.name}</h3>
              {group.lines.map((row) => (
                <div key={row.medicineId}>
                  <span>{row.medicineName}</span>
                  <strong>
                    {row.quantity} {row.unit}
                  </strong>
                </div>
              ))}
              <p>
                Estimated {formatInr(group.total, 2)}
                {group.unknown ? " + unpriced items" : ""}, before taxes and
                delivery.
              </p>
              {Number(group.supplier.minimum_order_value) > group.total && (
                <p className="text-warning">
                  Below supplier minimum order; confirm charges.
                </p>
              )}
            </div>
          ))}
          <p className="text-xs text-muted">
            No stock or supplier balance changes until goods are received. No
            messages are sent automatically.
          </p>
          {saveError && (
            <p role="alert" className="text-sm text-danger">
              {saveError}
            </p>
          )}
        </div>
      </Modal>
      <Modal
        isOpen={!!preview}
        onClose={() => setPreview(null)}
        title="Supplier message preview"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              Close
            </Button>
            <Button
              disabled={
                preview?.status === "CANCELLED" || preview?.status === "CLOSED"
              }
              onClick={() => preview && void copyMessage(preview)}
            >
              <ClipboardCopy size={15} /> Copy message
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted mb-4">
          {preview?.status === "CANCELLED" || preview?.status === "CLOSED"
            ? "Historical message for a completed or cancelled order. Do not share it as a new order."
            : preview?.status === "PARTIAL"
              ? "This follow-up shows only the remaining delivery. Copy it for manual sharing; automated delivery is not connected."
              : "Prepared for manual sharing. WhatsApp and SMS delivery are not connected."}
        </p>
        <textarea
          aria-label="Supplier order message"
          readOnly
          value={preview?.body || ""}
          className="supply-message-preview"
          rows={12}
        />
      </Modal>
      <Modal
        isOpen={!!cancelOrder}
        onClose={() => {
          if (!saving) setCancelOrder(null);
        }}
        title={
          cancelOrder?.status === "PARTIAL"
            ? "Cancel the remaining delivery?"
            : "Cancel this order draft?"
        }
        footer={
          <>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => setCancelOrder(null)}
            >
              Keep draft
            </Button>
            <Button
              variant="danger"
              disabled={saving}
              onClick={() => void cancel()}
            >
              {saving
                ? "Cancelling…"
                : cancelOrder?.status === "PARTIAL"
                  ? "Cancel remaining"
                  : "Cancel draft"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Cancel the outstanding quantities on {cancelOrder?.po_number} for{" "}
          {cancelOrder?.supplier_name}. They will return to the buying plan.
          Previously received stock stays recorded. If you already shared it,
          contact the supplier separately to stop dispatch.
        </p>
      </Modal>
    </div>
  );
}
