import { useId, useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../lib/auth";
import {
  WalletService,
  walletMoney,
  type CoinPolicy,
} from "../../services/walletService";
import {
  coinPolicyDraft,
  parseCoinPolicyDraft,
} from "../../utils/coinPolicyDraft";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

export function NexCoinPolicyForm({
  policy,
  onSaved,
  onCancel,
  expanded = false,
  onBusyChange,
}: {
  policy: CoinPolicy;
  onSaved?: (policy: CoinPolicy) => void;
  onCancel?: () => void;
  expanded?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const client = useQueryClient();
  const scope = useAuth((s) => `${s.user?.id}:${s.clinic_id}`);
  const [current, setCurrent] = useState(policy);
  const [draft, setDraft] = useState(() => coinPolicyDraft(policy));
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  const busy = useRef(false);
  const id = useId();
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(coinPolicyDraft(current));

  async function save() {
    if (busy.current || needsReload) return;
    let input: CoinPolicy & { reason: string };
    try {
      input = parseCoinPolicyDraft(draft, current.version);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the values below.");
      return;
    }
    busy.current = true;
    onBusyChange?.(true);
    setSaving(true);
    setError("");
    try {
      const saved = await WalletService.savePolicy(input);
      setCurrent(saved);
      setDraft(coinPolicyDraft(saved));
      client.setQueryData(["nex-coin-policy", scope], saved);
      void client.invalidateQueries({ queryKey: ["customer-wallet"] });
      void client.invalidateQueries({ queryKey: ["nex-coin-policy"] });
      toast.success("Nex Coins settings saved");
      onSaved?.(saved);
    } catch (e: unknown) {
      setError(
        (e as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ||
          "Could not confirm the update. Reload the current rules before trying again.",
      );
      setNeedsReload(true);
    } finally {
      busy.current = false;
      onBusyChange?.(false);
      setSaving(false);
    }
  }

  async function reload() {
    if (busy.current) return;
    busy.current = true;
    onBusyChange?.(true);
    setReloading(true);
    try {
      const latest = await WalletService.getPolicy();
      setCurrent(latest);
      setDraft(coinPolicyDraft(latest));
      client.setQueryData(["nex-coin-policy", scope], latest);
      setNeedsReload(false);
      setError("");
    } catch {
      setError(
        "Could not reload Nex Coins settings. Check your connection and retry.",
      );
    } finally {
      busy.current = false;
      onBusyChange?.(false);
      setReloading(false);
    }
  }

  const exampleBill = Math.max(1000, Number(draft.minimumSale) || 0);
  const rawEarned = Math.floor(
    (Math.round(exampleBill * 100) * (Number(draft.rate) || 0)) / 100,
  );
  const exampleEarned = !draft.enabled
    ? 0
    : Number(draft.earningCap) > 0
      ? Math.min(rawEarned, Math.round(Number(draft.earningCap) * 100))
      : rawEarned;
  const field = (key: keyof typeof draft) => ({
    value: String(draft[key]),
    onChange: (event: ChangeEvent<HTMLInputElement>) =>
      setDraft({ ...draft, [key]: event.target.value }),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="space-y-5"
      aria-label="Nex Coins settings"
    >
      <fieldset disabled={saving || reloading} className="min-w-0 space-y-5">
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-surface-elevated/50 p-4">
          <span>
            <span className="block text-sm font-semibold">
              Automatic earning
            </span>
            <span className="mt-1 block text-xs text-muted">
              Reward customers when an eligible bill is fully paid.
            </span>
          </span>
          <span className="relative shrink-0">
            <input
              type="checkbox"
              role="switch"
              className="peer sr-only"
              checked={draft.enabled}
              onChange={(event) =>
                setDraft({ ...draft, enabled: event.target.checked })
              }
            />
            <span
              aria-hidden
              className={`block h-6 w-11 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-disabled:opacity-50 ${draft.enabled ? "bg-primary" : "bg-border"}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${draft.enabled ? "translate-x-[22px]" : "translate-x-0.5"}`}
              />
            </span>
          </span>
        </label>
        <div
          className={
            expanded
              ? "grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]"
              : "space-y-5"
          }
        >
          <div className="grid min-w-0 gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Input
                label="Minimum sale to earn Nex Coins (₹)"
                type="number"
                inputMode="decimal"
                min={0}
                max={10000000}
                step="0.01"
                required
                {...field("minimumSale")}
                aria-describedby={`${id}-minimum`}
              />
              <p
                id={`${id}-minimum`}
                className="text-xs leading-relaxed text-muted"
              >
                Bills below this threshold earn no coins. Set 0 to allow any
                sale amount.
              </p>
            </div>
            <div className="space-y-2">
              <Input
                label="Earning rate (%)"
                type="number"
                inputMode="decimal"
                min={5}
                max={10}
                step="0.01"
                required
                {...field("rate")}
                aria-describedby={`${id}-rate`}
              />
              <p
                id={`${id}-rate`}
                className="text-xs leading-relaxed text-muted"
              >
                5–10% of the amount paid by cash, UPI or card.
              </p>
            </div>
            <div className="space-y-2">
              <Input
                label="Maximum Nex Coins earned per bill"
                type="number"
                inputMode="decimal"
                min={0}
                max={10000000}
                step="0.01"
                required
                {...field("earningCap")}
                aria-describedby={`${id}-cap`}
              />
              <p
                id={`${id}-cap`}
                className="text-xs leading-relaxed text-muted"
              >
                Limit rewards on each bill. Set 0 for no cap.
              </p>
            </div>
            <div className="space-y-2">
              <Input
                label="Maximum bill payable with Nex Coins (%)"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                required
                {...field("redemptionLimit")}
                aria-describedby={`${id}-redemption`}
              />
              <p
                id={`${id}-redemption`}
                className="text-xs leading-relaxed text-muted"
              >
                0 blocks redemption; 100 allows the full bill to be paid with
                coins.
              </p>
            </div>
            <div className="space-y-2">
              <Input
                label="New coins validity (days)"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                step={1}
                required
                {...field("expiryDays")}
              />
              <p className="text-xs leading-relaxed text-muted">
                Existing coins keep their original expiry dates.
              </p>
            </div>
          </div>
          {expanded && (
            <aside
              className="self-start rounded-xl border border-primary/20 bg-primary/5 p-5"
              aria-label="Nex Coins example"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-primary">
                How it works
              </p>
              <p className="mt-4 text-sm text-muted">
                On a fully paid ₹
                {new Intl.NumberFormat("en-IN", {
                  maximumFractionDigits: 2,
                }).format(exampleBill)}{" "}
                bill
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-foreground-strong">
                {walletMoney(exampleEarned)}{" "}
                <span className="text-sm font-medium text-muted">
                  Nex Coins
                </span>
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                {draft.enabled
                  ? "Example assumes full payment without redeeming coins. Returned purchases may reverse earned coins."
                  : "Automatic earning is paused. Customers earn no new coins."}
              </p>
              <div className="mt-5 border-t border-primary/15 pt-4 text-xs font-semibold text-primary">
                1 Nex Coin = ₹1 towards a bill
              </div>
            </aside>
          )}
        </div>
        <Input
          label="Reason for change"
          placeholder="e.g. Set a minimum purchase for rewards"
          required
          minLength={3}
          maxLength={500}
          {...field("reason")}
        />
      </fieldset>
      {error && (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger"
        >
          <p>{error}</p>
          {needsReload && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void reload()}
              isLoading={reloading}
              disabled={saving}
            >
              <RefreshCw size={14} aria-hidden />
              Reload current rules
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
        <p className="flex items-center gap-2 text-xs text-muted">
          <ShieldCheck size={16} className="shrink-0" aria-hidden />
          Changes are recorded · Rules version {current.version}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={saving || reloading || needsReload || !dirty}
            onClick={() => {
              setDraft(coinPolicyDraft(current));
              setError("");
            }}
          >
            Reset changes
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              disabled={saving || reloading}
              onClick={onCancel}
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            disabled={!dirty || needsReload || reloading}
            isLoading={saving}
          >
            Save Nex Coins settings
          </Button>
        </div>
      </div>
    </form>
  );
}
