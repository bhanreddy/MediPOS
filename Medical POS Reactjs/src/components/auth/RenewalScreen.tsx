import { PaymentScreen } from './PaymentScreen';
import type { AuthGate } from '../../services/authGateService';

export function RenewalScreen({ onNavigate }: { onNavigate: (gate: AuthGate) => void }) {
  return (
    <PaymentScreen
      onNavigate={onNavigate}
      title="Renew subscription"
      subtitle="Your plan has expired online. Renew to keep receiving automatic updates and cloud sync benefits. The POS remains usable while you renew."
    />
  );
}
