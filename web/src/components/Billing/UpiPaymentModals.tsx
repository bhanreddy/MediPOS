import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

type UpiModalState = 'closed' | 'missing_config' | 'qr';

interface UpiPaymentModalsProps {
    modal: UpiModalState;
    shopName: string;
    upiId: string;
    amount: number;
    qrValue: string;
    isConfirming?: boolean;
    onClose: () => void;
    onConfirmPayment: () => void;
}

export function UpiPaymentModals({
    modal,
    shopName,
    upiId,
    amount,
    qrValue,
    isConfirming = false,
    onClose,
    onConfirmPayment,
}: UpiPaymentModalsProps) {
    const navigate = useNavigate();

    return (
        <>
            <Modal
                isOpen={modal === 'missing_config'}
                onClose={onClose}
                title="UPI not configured"
                footer={
                    <>
                        <Button variant="ghost" onClick={onClose}>
                            Close
                        </Button>
                        <Button
                            variant="primary"
                            className="font-black"
                            onClick={() => {
                                onClose();
                                navigate('/settings');
                            }}
                        >
                            Open settings
                        </Button>
                    </>
                }
            >
                <p className="text-sm font-bold text-muted">
                    Save your UPI ID under Settings → Payment settings, then try again.
                </p>
            </Modal>

            <Modal
                isOpen={modal === 'qr'}
                onClose={onClose}
                title="Scan to pay (UPI)"
                footer={
                    <>
                        <Button variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            variant="success"
                            className="font-black"
                            onClick={onConfirmPayment}
                            disabled={isConfirming}
                            isLoading={isConfirming}
                        >
                            Payment received ✓
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col items-center gap-4 text-center">
                    <div>
                        <p className="text-lg font-black text-foreground-strong">{shopName}</p>
                        <p className="text-xs font-bold uppercase tracking-widest text-muted mt-1">{upiId}</p>
                    </div>
                    <p className="text-4xl font-black tabular-nums text-foreground-strong">₹ {amount.toFixed(2)}</p>
                    {qrValue ? (
                        <div className="bg-white p-3 rounded-xl border-2 border-border">
                            <QRCodeSVG value={qrValue} size={200} />
                        </div>
                    ) : (
                        <span className="text-muted text-sm font-bold">Preparing QR…</span>
                    )}
                    <p className="text-xs font-bold text-muted">Scan with GPay, PhonePe, Paytm, or BHIM</p>
                </div>
            </Modal>
        </>
    );
}

export type { UpiModalState };
