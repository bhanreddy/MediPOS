import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { WalletService, type CoinPolicy } from "../../services/walletService";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { LoadError } from "../ui/ListFeedback";
import { NexCoinPolicyForm } from "../Settings/NexCoinPolicyForm";

export function NexCoinRules({ policy }: { policy?: CoinPolicy }) {
  const owner = useAuth((s) => s.role === "OWNER");
  const scope = useAuth((s) => `${s.user?.id}:${s.clinic_id}`);
  const query = useQuery({
    queryKey: ["nex-coin-policy", scope],
    queryFn: ({ signal }) => WalletService.getPolicy(signal),
    enabled: owner && !policy,
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = policy || query.data;
  if (!owner) return null;

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        disabled={!policy && query.isPending}
        onClick={() => setOpen(true)}
      >
        <Settings2 size={15} aria-hidden />
        Nex Coins rules
      </Button>
      <Modal
        isOpen={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Nex Coins earning & redemption rules"
      >
        {!current ? (
          <LoadError onRetry={() => void query.refetch()} />
        ) : (
          <NexCoinPolicyForm
            policy={current}
            onBusyChange={setBusy}
            onSaved={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        )}
      </Modal>
    </>
  );
}
