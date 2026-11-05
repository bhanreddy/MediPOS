import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  BellRing,
  Building2,
  Check,
  Coins,
  CreditCard,
  DatabaseBackup,
  Download,
  FileText,
  Moon,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Upload,
  Users,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../hooks/useTheme";
import { AppSettingsService } from "../../services/appSettingsService";
import { BackupService } from "../../utils/backupService";
import { useUpiId } from "../../hooks/useUpiId";
import { useShopDisplayName } from "../../hooks/useShopDisplayName";
import { buildUpiPaymentUri } from "../../lib/upiPaymentUri";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { PAYMENT_COPY, SETTINGS_SCREEN_COPY } from "../../config/appContent";
import { NexCoinSettings } from "./NexCoinSettings";
import { ShopProfileSettingsCard } from "./ShopProfileSettingsCard";

const UPI_PATTERN = /^[^\s@]+@[^\s@]+$/;

type Operation = "upi" | "expiry" | "sales" | "export" | "restore";
type Feedback = { operation: Operation; error?: string; message?: string };

function SectionHeading({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="rounded-xl bg-primary/8 p-2.5 text-primary" aria-hidden>
        {icon}
      </span>
      <div>
        <h2 className="text-base font-bold text-foreground-strong">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
      </div>
    </div>
  );
}

export const SettingsScreen = () => {
  const canManage = useAuth((s) => s.isOwner || s.isSuperAdmin);
  const isOwner = useAuth((s) => s.role === "OWNER");
  const { theme, setTheme } = useTheme();
  const { upiId, saveUpiId, isLoading: upiLoading } = useUpiId();
  const shopName = useShopDisplayName();
  const [upiDraft, setUpiDraft] = useState("");
  const [upiFieldError, setUpiFieldError] = useState("");
  const [allowExpiredSale, setAllowExpiredSale] = useState(false);
  const [alertExpiryDays, setAlertExpiryDays] = useState("30");
  const [savedExpiryDays, setSavedExpiryDays] = useState("30");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<Operation | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const pending = useRef(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      AppSettingsService.getBoolean("allow_expired_sale", false),
      AppSettingsService.getString("alert_expiry_days", "30"),
    ])
      .then(([allow, days]) => {
        if (!mounted) return;
        setAllowExpiredSale(allow);
        setAlertExpiryDays(days);
        setSavedExpiryDays(days);
      })
      .catch(() => {
        if (mounted)
          setLoadError(
            "Could not load device preferences. Reload this page to retry.",
          );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setUpiDraft(upiId);
  }, [upiId]);

  async function perform(
    operation: Operation,
    action: () => Promise<void>,
    message: string,
  ) {
    if (pending.current) return;
    pending.current = true;
    setBusy(operation);
    setFeedback(null);
    try {
      await action();
      setFeedback({ operation, message });
    } catch (error) {
      setFeedback({
        operation,
        error:
          error instanceof Error
            ? error.message
            : "Could not save. Please retry.",
      });
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  const notice = (operation: Operation) =>
    feedback?.operation === operation && (
      <p
        role={feedback.error ? "alert" : "status"}
        className={`mt-3 text-sm ${feedback.error ? "text-danger" : "text-success"}`}
      >
        {feedback.error || feedback.message}
      </p>
    );

  function saveExpiry(event: React.FormEvent) {
    event.preventDefault();
    const days = Number(alertExpiryDays);
    if (
      !alertExpiryDays.trim() ||
      !Number.isInteger(days) ||
      days < 1 ||
      days > 365
    ) {
      setFeedback({
        operation: "expiry",
        error: "Enter a whole number of days between 1 and 365.",
      });
      return;
    }
    void perform(
      "expiry",
      async () => {
        await AppSettingsService.setString(
          "alert_expiry_days",
          String(days),
          "ALERTS",
        );
        setAlertExpiryDays(String(days));
        setSavedExpiryDays(String(days));
      },
      "Expiry warning window saved",
    );
  }

  function saveUpi(event: React.FormEvent) {
    event.preventDefault();
    if (!UPI_PATTERN.test(upiDraft.trim())) {
      setUpiFieldError("Enter a valid UPI ID, such as pharmacy@upi.");
      return;
    }
    setUpiFieldError("");
    void perform("upi", () => saveUpiId(upiDraft.trim()), "UPI ID saved");
  }

  function restore(file?: File) {
    if (!file) return;
    if (
      !window.confirm(
        "Restore this backup into your store? Records with matching IDs may be replaced. The app will reload when finished.",
      )
    )
      return;
    void perform(
      "restore",
      () => BackupService.restoreData(file),
      "Backup restored",
    );
  }

  const quickLinks = [
    {
      to: "/settings/clinic",
      title: "Business profile",
      description: "Contact, address & licences",
      icon: Building2,
    },
    {
      to: "/settings/invoice",
      title: "Invoice details",
      description: "Receipt footer & payment ID",
      icon: FileText,
    },
    ...(isOwner
      ? [
          {
            to: "/settings/users",
            title: "Team & access",
            description: "Staff accounts & permissions",
            icon: Users,
          },
          {
            to: "/settings/billing",
            title: "Plan & billing",
            description: "Subscription & payment history",
            icon: CreditCard,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto box-border w-full min-w-0 max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
            Your workspace
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground-strong sm:text-3xl">
            {SETTINGS_SCREEN_COPY.title}
          </h1>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
            {SETTINGS_SCREEN_COPY.subtitle}
          </p>
        </div>
        <Badge variant="neutral" className="gap-1.5">
          <ShieldCheck size={13} aria-hidden />
          {canManage ? "Store management" : "Workspace preferences"}
        </Badge>
      </header>

      <div
        className={`grid min-w-0 grid-cols-2 gap-3 ${isOwner ? "xl:grid-cols-4" : ""}`}
      >
        {quickLinks.map(({ to, title, description, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="group relative flex min-w-0 flex-col items-start gap-2 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary sm:flex-row sm:gap-3"
          >
            <Icon
              size={19}
              className="mt-0.5 shrink-0 text-primary"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold sm:text-sm">{title}</p>
              <p className="mt-1 hidden text-xs leading-relaxed text-muted sm:block">
                {description}
              </p>
            </div>
            <ArrowUpRight
              size={15}
              className="absolute right-3 top-4 shrink-0 text-muted group-hover:text-primary sm:static"
              aria-hidden
            />
          </Link>
        ))}
      </div>

      <nav
        aria-label="Settings sections"
        className="flex flex-wrap gap-1 border-b border-border pb-3"
      >
        {[
          ["business", "Business", Building2],
          ["nex-coins", "Nex Coins", Coins],
          ["payments", "Payments", CreditCard],
          ["preferences", "Preferences", SlidersHorizontal],
          ["backups", "Backups", DatabaseBackup],
        ].map(([id, label, Icon]) => (
          <a
            key={String(id)}
            href={`#${id}`}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-muted hover:bg-primary/5 hover:text-primary"
          >
            <Icon size={15} aria-hidden />
            {String(label)}
          </a>
        ))}
      </nav>

      <ShopProfileSettingsCard />
      <NexCoinSettings />

      <Card id="payments" className="min-w-0 scroll-mt-6 p-5 sm:p-6">
        <SectionHeading
          icon={<CreditCard size={21} />}
          title="UPI payments"
          description="Choose where customer payments go. Your UPI ID is used for payment QR codes on bills."
        />
        <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_15rem]">
          <form onSubmit={saveUpi} className="min-w-0 space-y-4">
            <Input
              label="Business UPI ID"
              placeholder="pharmacy@upi"
              value={upiDraft}
              autoCapitalize="none"
              spellCheck={false}
              disabled={!canManage || upiLoading || busy === "upi"}
              error={upiFieldError || undefined}
              onChange={(event) => {
                setUpiDraft(event.target.value);
                setUpiFieldError("");
                if (feedback?.operation === "upi") setFeedback(null);
              }}
            />
            <p className="text-xs leading-relaxed text-muted">
              Check that this ID belongs to your business before accepting
              payments.
            </p>
            <Button
              type="submit"
              disabled={
                !canManage || !!busy || upiLoading || upiDraft.trim() === upiId
              }
              isLoading={busy === "upi"}
            >
              Save UPI ID
            </Button>
            {!canManage && (
              <p className="text-xs text-muted">
                Only the store owner can update payment details.
              </p>
            )}
            {notice("upi")}
          </form>
          <div className="flex min-h-48 min-w-0 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface-elevated/50 p-4">
            <p className="text-xs font-semibold text-muted">QR preview</p>
            {UPI_PATTERN.test(upiDraft.trim()) ? (
              <>
                <div className="rounded-lg bg-white p-2">
                  <QRCodeSVG
                    value={buildUpiPaymentUri({
                      vpa: upiDraft.trim(),
                      payeeName: shopName,
                      amount: 1,
                    })}
                    size={112}
                  />
                </div>
                <p className="text-center text-[11px] leading-relaxed text-muted">
                  {PAYMENT_COPY.upiQrPreviewNote}
                </p>
              </>
            ) : (
              <p className="text-center text-xs text-muted">
                Enter a valid UPI ID to preview your payment QR.
              </p>
            )}
          </div>
        </div>
      </Card>

      <div
        id="preferences"
        className="grid min-w-0 scroll-mt-6 items-start gap-5 lg:grid-cols-2"
      >
        <Card className="min-w-0 p-5 sm:p-6">
          <SectionHeading
            icon={<BellRing size={21} />}
            title="Stock alerts"
            description="Get an early warning before medicines expire."
          />
          {loadError && (
            <p role="alert" className="mb-4 text-sm text-danger">
              {loadError}
            </p>
          )}
          <form onSubmit={saveExpiry} className="space-y-4">
            <Input
              label="Expiry warning window (days)"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              step={1}
              required
              value={alertExpiryDays}
              disabled={loading || !!loadError || busy === "expiry"}
              onChange={(event) => {
                setAlertExpiryDays(event.target.value);
                if (feedback?.operation === "expiry") setFeedback(null);
              }}
            />
            <p className="text-xs leading-relaxed text-muted">
              Batches expiring within 1–365 days appear in stock alerts and
              notification badges. Saved on this device.
            </p>
            <Button
              type="submit"
              disabled={
                loading ||
                !!loadError ||
                !!busy ||
                alertExpiryDays === savedExpiryDays
              }
              isLoading={busy === "expiry"}
            >
              Save alert window
            </Button>
            {notice("expiry")}
          </form>
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-sm font-semibold">Low stock thresholds</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Set the minimum stock for each medicine in your inventory.
            </p>
            <Link
              to="/inventory"
              className="mt-3 inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-primary"
            >
              Open inventory
              <ArrowUpRight size={14} aria-hidden />
            </Link>
          </div>
        </Card>
        <div className="min-w-0 space-y-5">
          <Card className="p-5 sm:p-6">
            <SectionHeading
              icon={<Palette size={21} />}
              title="Appearance"
              description="Choose a comfortable look for this device."
            />
            <div
              className="grid grid-cols-2 gap-3"
              role="group"
              aria-label="Color theme"
            >
              {(
                [
                  { value: "light", label: "Light", icon: Sun },
                  { value: "dark", label: "Dark", icon: Moon },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={theme === value}
                  onClick={() => setTheme(value)}
                  className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary ${theme === value ? "border-primary bg-primary/5 text-primary" : "border-border text-muted hover:bg-surface-elevated"}`}
                >
                  <Icon size={17} aria-hidden />
                  {label}
                  {theme === value && <Check size={15} aria-hidden />}
                </button>
              ))}
            </div>
          </Card>
          <Card className="p-5 sm:p-6">
            <SectionHeading
              icon={<SlidersHorizontal size={21} />}
              title="Sales preferences"
              description="Manage sales preferences for this device."
            />
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Allow expired sale</p>
                <p className="mt-1 text-xs text-muted">
                  {allowExpiredSale
                    ? "Enabled on this device."
                    : "Disabled on this device."}
                </p>
              </div>
              <Button
                role="switch"
                aria-checked={allowExpiredSale}
                aria-label="Allow expired sale"
                variant={allowExpiredSale ? "danger" : "secondary"}
                disabled={loading || !!loadError || !!busy || !canManage}
                onClick={() =>
                  void perform(
                    "sales",
                    async () => {
                      const next = !allowExpiredSale;
                      await AppSettingsService.setBoolean(
                        "allow_expired_sale",
                        next,
                        "SALES",
                      );
                      setAllowExpiredSale(next);
                    },
                    "Sales preference saved",
                  )
                }
              >
                <span
                  className={`relative inline-flex h-5 w-9 rounded-full ${allowExpiredSale ? "bg-white/25" : "bg-border"}`}
                  aria-hidden
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${allowExpiredSale ? "translate-x-[18px]" : "translate-x-0.5"}`}
                  />
                </span>
                <span className="sr-only">
                  {allowExpiredSale ? "On" : "Off"}
                </span>
              </Button>
            </div>
            {notice("sales")}
          </Card>
        </div>
      </div>

      <Card id="backups" className="min-w-0 scroll-mt-6 p-5 sm:p-6">
        <SectionHeading
          icon={<DatabaseBackup size={21} />}
          title="Backup & restore"
          description="Download a copy of your store records or import an existing JSON backup."
        />
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold">Export store data</h3>
            <p className="mb-4 mt-2 text-xs leading-relaxed text-muted">
              Keep a JSON copy of the store records included in the backup
              export.
            </p>
            <Button
              variant="secondary"
              disabled={!canManage || !!busy}
              isLoading={busy === "export"}
              onClick={() =>
                void perform(
                  "export",
                  async () => {
                    const blob = await BackupService.exportData();
                    BackupService.downloadBackup(blob);
                  },
                  "Backup downloaded",
                )
              }
            >
              <Download size={15} aria-hidden />
              Export backup
            </Button>
            {notice("export")}
          </div>
          <div className="rounded-xl border border-danger/20 bg-danger/5 p-4">
            <h3 className="text-sm font-semibold">Restore from a backup</h3>
            <p className="mb-4 mt-2 text-xs leading-relaxed text-muted">
              Import store records from a JSON file. Matching records may be
              replaced. Export a backup first.
            </p>
            <Button
              variant="secondary"
              className="text-danger"
              disabled={!canManage || !!busy}
              isLoading={busy === "restore"}
              onClick={() => restoreInputRef.current?.click()}
            >
              <Upload size={15} aria-hidden />
              Choose backup file
            </Button>
            <input
              ref={restoreInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                restore(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            {notice("restore")}
          </div>
        </div>
        {!canManage && (
          <p className="mt-4 text-xs text-muted">
            Only the store owner can export or restore backups.
          </p>
        )}
      </Card>
    </div>
  );
};
