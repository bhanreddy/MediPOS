import type { CoinPolicy } from "../services/walletService";

export type CoinPolicyDraft = {
  enabled: boolean;
  rate: string;
  minimumSale: string;
  earningCap: string;
  redemptionLimit: string;
  expiryDays: string;
  reason: string;
};

export function coinPolicyDraft(policy: CoinPolicy): CoinPolicyDraft {
  return {
    enabled: policy.enabled,
    rate: String(policy.rate_bps / 100),
    minimumSale: String(policy.minimum_sale_paise / 100),
    earningCap: String(policy.earning_cap_paise / 100),
    redemptionLimit: String(policy.redemption_limit_percent),
    expiryDays: String(policy.expiry_days),
    reason: "",
  };
}

export function parseCoinPolicyDraft(
  draft: CoinPolicyDraft,
  version: number,
): CoinPolicy & { reason: string } {
  const decimal = (
    raw: string,
    label: string,
    min: number,
    max: number,
    scale: number,
  ) => {
    const value = Number(raw);
    const scaled = value * scale;
    if (
      !raw.trim() ||
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      Math.abs(scaled - Math.round(scaled)) > 0.000001
    ) {
      throw new Error(
        `${label} must be between ${min.toLocaleString("en-IN")} and ${max.toLocaleString("en-IN")}${scale === 100 ? ", with at most 2 decimal places" : ", in whole numbers"}.`,
      );
    }
    return Math.round(scaled);
  };
  const reason = draft.reason.trim();
  if (reason.length < 3 || reason.length > 500)
    throw new Error("Enter a reason between 3 and 500 characters.");
  return {
    version,
    enabled: draft.enabled,
    rate_bps: decimal(draft.rate, "Earning rate (%)", 5, 10, 100),
    minimum_sale_paise: decimal(
      draft.minimumSale,
      "Minimum sale (₹)",
      0,
      10000000,
      100,
    ),
    earning_cap_paise: decimal(
      draft.earningCap,
      "Earning cap",
      0,
      10000000,
      100,
    ),
    redemption_limit_percent: decimal(
      draft.redemptionLimit,
      "Redemption limit (%)",
      0,
      100,
      1,
    ),
    expiry_days: decimal(draft.expiryDays, "Coin validity (days)", 1, 365, 1),
    reason,
  };
}
