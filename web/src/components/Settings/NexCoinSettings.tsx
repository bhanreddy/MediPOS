import { useQuery } from "@tanstack/react-query";
import { Coins, RefreshCw } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { WalletService, walletMoney } from "../../services/walletService";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { NexCoinPolicyForm } from "./NexCoinPolicyForm";

export function NexCoinSettings() {
  const role = useAuth((s) => s.role);
  const scope = useAuth((s) => `${s.user?.id}:${s.clinic_id}`);
  const canView =
    role === "OWNER" || role === "PHARMACIST" || role === "CASHIER";
  const query = useQuery({
    queryKey: ["nex-coin-policy", scope],
    queryFn: ({ signal }) => WalletService.getPolicy(signal),
    enabled: canView,
    retry: false,
  });
  const policy = query.data;

  return (
    <Card id="nex-coins" className="scroll-mt-6 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-primary/5 p-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <Coins size={21} aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-bold text-foreground-strong">
              Nex Coins
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              Set earning thresholds and keep customer rewards within your
              budget.
            </p>
          </div>
        </div>
        <Badge variant={policy?.enabled ? "success" : "neutral"}>
          {policy
            ? policy.enabled
              ? "Earning active"
              : "Earning paused"
            : "Customer rewards"}
        </Badge>
      </div>
      <div className="p-5 sm:p-6">
        {!canView ? (
          <p className="text-sm text-muted">
            Ask your store owner to manage Nex Coins thresholds.
          </p>
        ) : query.isPending ? (
          <p role="status" className="py-6 text-sm text-muted">
            Loading Nex Coins settings…
          </p>
        ) : query.isError ? (
          <div role="alert" className="space-y-3">
            <p className="text-sm text-danger">
              Could not load Nex Coins settings. Check your connection and
              retry.
            </p>
            <Button
              variant="secondary"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw size={15} aria-hidden />
              Retry
            </Button>
          </div>
        ) : (
          policy &&
          (role === "OWNER" ? (
            <NexCoinPolicyForm key={scope} policy={policy} expanded />
          ) : (
            <>
              <p className="mb-5 text-sm text-muted">
                Only the store owner can change these settings.
              </p>
              <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  [
                    "Minimum sale to earn",
                    `₹${walletMoney(policy.minimum_sale_paise)}`,
                  ],
                  ["Earning rate", `${policy.rate_bps / 100}%`],
                  [
                    "Maximum earned per bill",
                    policy.earning_cap_paise
                      ? `${walletMoney(policy.earning_cap_paise)} coins`
                      : "No cap",
                  ],
                  [
                    "Redemption limit",
                    `${policy.redemption_limit_percent}% of a bill`,
                  ],
                  ["New coins validity", `${policy.expiry_days} days`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="mt-1 text-sm font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ))
        )}
      </div>
    </Card>
  );
}
