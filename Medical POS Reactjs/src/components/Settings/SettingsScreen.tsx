import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import type { RootState } from '../../state/store';
import { AppSettingsService } from '../../services/appSettingsService';
import { ShopProfileService } from '../../services/shopProfileService';
import { BackupService } from '../../utils/backupService';
import { useUpiId } from '../../hooks/useUpiId';

import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { QRCodeSVG } from 'qrcode.react';
import { BRANDING, PAYMENT_COPY, SETTINGS_SCREEN_COPY } from '../../config/appContent';

const UPI_PATTERN = /^[^\s@]+@[^\s@]+$/;

export const SettingsScreen: React.FC = () => {
    const { session } = useSelector((s: RootState) => s.auth);
    const { upiId, saveUpiId } = useUpiId();
    const [upiDraft, setUpiDraft] = useState('');
    const [upiFieldError, setUpiFieldError] = useState<string | null>(null);

    const [allowExpiredSale, setAllowExpiredSale] = useState(false);
    const [alertExpiryDays, setAlertExpiryDays] = useState('30');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);

    const restoreInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const value = await AppSettingsService.getBoolean('allow_expired_sale', false);
                const expDays = await AppSettingsService.getString('alert_expiry_days', '30');
                if (!mounted) return;
                setAllowExpiredSale(value);
                setAlertExpiryDays(expDays);
            } catch (e: any) {
                if (!mounted) return;
                setError(e?.message || 'Failed to load settings');
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        setUpiDraft(upiId);
    }, [upiId]);

    const validateUpiFormat = (raw: string): string | null => {
        const t = raw.trim();
        if (!t) return null;
        if (!UPI_PATTERN.test(t)) return 'Use a valid UPI ID format (something@something)';
        return null;
    };

    const saveUpiSettings = () => {
        setError(null);
        setStatus(null);
        const err = validateUpiFormat(upiDraft);
        if (err) {
            setUpiFieldError(err);
            return;
        }
        setUpiFieldError(null);
        const next = upiDraft.trim();
        saveUpiId(next);
        setStatus('UPI ID saved');
    };

    const sessionModeLabel = useMemo(() => {
        if (!session) return 'UNKNOWN';
        return session.is_offline_session ? 'OFFLINE' : 'ONLINE';
    }, [session]);

    const saveExpiryAlertDays = async () => {
        setError(null);
        setStatus(null);
        const n = Number(alertExpiryDays);
        if (!Number.isFinite(n) || n < 1 || n > 365) {
            setError('Expiry alert days must be 1–365');
            return;
        }
        setIsLoading(true);
        try {
            await AppSettingsService.setString('alert_expiry_days', String(Math.floor(n)), 'ALERTS');
            setStatus('Alert threshold saved');
        } catch (e: any) {
            setError(e?.message || 'Failed to save');
        } finally {
            setIsLoading(false);
        }
    };

    const toggleAllowExpiredSale = async () => {
        setError(null);
        setStatus(null);
        const next = !allowExpiredSale;
        setAllowExpiredSale(next);

        setIsLoading(true);
        try {
            await AppSettingsService.setBoolean('allow_expired_sale', next, 'SALES');
            setStatus('Saved');
        } catch (e: any) {
            setAllowExpiredSale(!next);
            setError(e?.message || 'Failed to save');
        } finally {
            setIsLoading(false);
        }
    };

    const exportBackup = async () => {
        setError(null);
        setStatus(null);
        setIsLoading(true);
        try {
            const blob = await BackupService.exportData();
            BackupService.downloadBackup(blob);
            setStatus('Backup exported');
        } catch (e: any) {
            setError(e?.message || 'Export failed');
        } finally {
            setIsLoading(false);
        }
    };

    const requestRestore = () => {
        setError(null);
        setStatus(null);
        restoreInputRef.current?.click();
    };

    const onRestoreFileSelected = async (file: File | null) => {
        setError(null);
        setStatus(null);
        if (!file) return;

        const ok = window.confirm('Restore will overwrite local data and reload the app. Continue?');
        if (!ok) return;

        setIsLoading(true);
        try {
            await BackupService.restoreData(file);
        } catch (e: any) {
            setError(e?.message || 'Restore failed');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6 animate-slideIn">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-black text-foreground-strong tracking-tight">{SETTINGS_SCREEN_COPY.title}</h1>
                    <p className="text-sm text-muted mt-1">{SETTINGS_SCREEN_COPY.subtitle}</p>
                </div>
                <Badge variant={session?.is_offline_session ? 'warning' : 'success'}>{sessionModeLabel}</Badge>
            </div>

            {(error || status) && (
                <div
                    className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
                        error ? 'bg-danger/10 border-danger/30 text-danger' : 'bg-success/10 border-success/30 text-success'
                    }`}
                >
                    {error ?? status}
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Card className="p-6 flex flex-col gap-4 col-span-1 xl:col-span-2">
                    <MedicalProfileCard />
                </Card>

                <Card className="p-6 flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-bold text-muted uppercase tracking-wider">Sales rules</h2>
                        <Badge variant="primary">Live</Badge>
                    </div>
                    <div className="rounded-lg border border-border bg-bg-primary p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <p className="text-xs font-bold text-muted uppercase tracking-wider">Allow expired sale</p>
                            <p className="text-xs text-muted mt-1">Controls FEFO allocation behavior.</p>
                        </div>
                        <Button
                            variant={allowExpiredSale ? 'danger' : 'secondary'}
                            onClick={toggleAllowExpiredSale}
                            disabled={isLoading}
                        >
                            {allowExpiredSale ? 'On' : 'Off'}
                        </Button>
                    </div>
                </Card>

                <Card className="p-6 flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-bold text-muted uppercase tracking-wider">Backup</h2>
                        <Badge variant="warning">Manual</Badge>
                    </div>
                    <div className="rounded-lg border border-border bg-bg-primary p-4 flex flex-col gap-4">
                        <p className="text-xs text-muted leading-relaxed">
                            Export creates a JSON backup. Restore overwrites local data and reloads.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="primary" onClick={exportBackup} isLoading={isLoading}>
                                Export
                            </Button>
                            <Button variant="danger" onClick={requestRestore} disabled={isLoading}>
                                Restore
                            </Button>
                            <input
                                ref={restoreInputRef}
                                type="file"
                                accept="application/json,.json"
                                className="hidden"
                                onChange={e => onRestoreFileSelected(e.target.files?.[0] ?? null)}
                            />
                        </div>
                    </div>
                </Card>

                <Card className="p-6 flex flex-col gap-4 xl:col-span-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <h2 className="text-sm font-bold text-muted uppercase tracking-wider">Stock alerts</h2>
                        <Badge variant="primary">IndexedDB</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-lg border border-border bg-bg-primary p-4 space-y-3">
                            <p className="text-xs font-bold text-muted uppercase tracking-wider">Expiry warning window (days)</p>
                            <p className="text-xs text-muted leading-relaxed">
                                Batches expiring within this window count toward header badges and startup alert.
                            </p>
                            <div className="flex flex-wrap gap-2 items-end">
                                <Input
                                    label="Days (1–365)"
                                    value={alertExpiryDays}
                                    onChange={e => setAlertExpiryDays(e.target.value)}
                                    containerClassName="min-w-[8rem] flex-1"
                                />
                                <Button variant="primary" onClick={() => void saveExpiryAlertDays()} disabled={isLoading} className="shrink-0">
                                    Save
                                </Button>
                            </div>
                        </div>
                        <div className="rounded-lg border border-border bg-bg-primary p-4 space-y-2">
                            <p className="text-xs font-bold text-muted uppercase tracking-wider">Low stock</p>
                            <p className="text-xs text-muted leading-relaxed">
                                Each medicine uses its own min stock alert from Medicine Master. Inventory compares on-hand qty to that threshold.
                            </p>
                        </div>
                    </div>
                </Card>

                <Card className="p-6 flex flex-col gap-4 xl:col-span-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <h2 className="text-sm font-bold text-muted uppercase tracking-wider">Payment settings</h2>
                        <Badge variant="primary">UPI</Badge>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">
                        Store your VPA for customer UPI payments. Used on the billing screen to generate a dynamic pay QR per bill.
                    </p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="rounded-lg border border-border bg-bg-primary p-4 space-y-3">
                            <Input
                                label="UPI ID"
                                placeholder="pharmacy@upi or 9876543210@paytm"
                                value={upiDraft}
                                onChange={e => {
                                    setUpiDraft(e.target.value);
                                    setUpiFieldError(validateUpiFormat(e.target.value));
                                }}
                                error={upiFieldError || undefined}
                            />
                            <Button variant="primary" onClick={saveUpiSettings} disabled={isLoading}>
                                Save UPI ID
                            </Button>
                        </div>
                        <div className="rounded-lg border border-border bg-bg-primary p-4 flex flex-col items-center justify-center gap-3 min-h-[200px]">
                            <p className="text-xs font-bold text-muted uppercase tracking-wider">Live preview</p>
                            {UPI_PATTERN.test(upiDraft.trim()) ? (
                                <>
                                    <div className="bg-white p-2 rounded-lg border border-border">
                                        <QRCodeSVG
                                            value={`upi://pay?pa=${encodeURIComponent(upiDraft.trim())}&pn=${encodeURIComponent(BRANDING.defaultMerchantDisplayName)}&am=1.00&cu=INR&tn=Bill%20Payment`}
                                            size={120}
                                        />
                                    </div>
                                    <span className="text-[10px] font-bold text-muted text-center">{PAYMENT_COPY.upiQrPreviewNote}</span>
                                </>
                            ) : (
                                <span className="text-sm text-muted text-center">Enter a valid UPI ID to preview QR</span>
                            )}
                        </div>
                    </div>
                </Card>

                <Card className="p-6 flex flex-col gap-3 xl:col-span-3 border-dashed opacity-95">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <h2 className="text-sm font-bold text-muted uppercase tracking-wider">Cloud backup</h2>
                        <Badge variant="warning">Coming soon</Badge>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">
                        Encrypted cloud sync for multi-terminal shops will appear here. Local JSON export remains the supported backup today.
                    </p>
                </Card>
            </div>
        </div>
    );
};

// Sub-component for Medical Profile to keep main component clean
const MedicalProfileCard = () => {
    const [profile, setProfile] = useState<any>(null); // Use ShopProfile type
    const [isEditingPhone, setIsEditingPhone] = useState(false);
    const [phoneDraft, setPhoneDraft] = useState('');
    const [loading, setLoading] = useState(false);
    const logoInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        ShopProfileService.getShopProfileLocal()
            .then(p => {
                setProfile(p);
                setPhoneDraft(p.phone_number);
            })
            .catch(err => console.error("Profile load failed", err));
    }, []);

    const handleSavePhone = async () => {
        setLoading(true);
        try {
            await ShopProfileService.updatePhoneNumber(phoneDraft);
            const updated = await ShopProfileService.getShopProfileLocal();
            setProfile(updated);
            setIsEditingPhone(false);
        } catch (err) {
            alert("Failed to save phone number");
        } finally {
            setLoading(false);
        }
    };

    const handleLogoSelect = async (file: File | null) => {
        if (!file) return;

        // Limit size to 2MB
        if (file.size > 2 * 1024 * 1024) {
            alert('Logo too large. Max 2MB allowed.');
            return;
        }

        setLoading(true);
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64 = e.target?.result as string;
                if (base64) {
                    await ShopProfileService.updateLogo(base64);
                    const updated = await ShopProfileService.getShopProfileLocal();
                    setProfile(updated);
                }
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error("Logo upload failed", err);
            alert("Failed to update logo");
        } finally {
            setLoading(false);
        }
    };

    if (!profile) {
        return (
            <div className="flex flex-col gap-3 text-muted">
                <p className="text-sm text-foreground">No profile data found locally.</p>
                <button
                    type="button"
                    onClick={() => {
                        setLoading(true);
                        ShopProfileService.syncShopProfile()
                            .then(p => setProfile(p))
                            .catch(err => alert("Sync Failed: " + err.message))
                            .finally(() => setLoading(false));
                    }}
                    disabled={loading}
                    className="text-sm font-semibold text-accent-primary hover:underline w-fit"
                >
                    {loading ? 'Syncing…' : 'Sync from online'}
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div
                        className="relative w-16 h-16 rounded-full border-2 border-border bg-bg-primary overflow-hidden group cursor-pointer"
                        onClick={() => logoInputRef.current?.click()}
                    >
                        {profile.logo_url ? (
                            <img src={profile.logo_url} alt="Logo" className="w-full h-full object-contain" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl">🏥</div>
                        )}
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[8px] font-black uppercase text-white tracking-widest text-center px-1">Change Logo</span>
                        </div>
                    </div>
                    <input
                        ref={logoInputRef}
                        type="file"
                        className="hidden"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => handleLogoSelect(e.target.files?.[0] || null)}
                    />

                    <div>
                        <p className="text-lg font-black text-foreground-strong tracking-tight">{profile.medical_name}</p>
                        <p className="text-xs text-muted mt-1">
                            {profile.verified ? 'Verified business' : 'Unverified'}
                        </p>
                    </div>
                </div>
                <Badge variant={profile.verified ? 'success' : 'warning'}>
                    {profile.verified ? 'Online' : 'Offline Mode'}
                </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* LEGAL (LOCKED) */}
                <div className="space-y-4">
                    <h4 className="text-xs font-bold text-muted uppercase tracking-wider border-b border-border pb-2">Legal identity (locked)</h4>

                    <div>
                        <div className="text-[10px] font-bold text-muted uppercase">Owner / License Holder</div>
                        <div className="font-bold text-foreground">{profile.owner_name}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="text-[10px] font-bold text-muted uppercase">GST Number</div>
                            <div className="font-mono text-sm font-bold text-foreground">{profile.gst_number}</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-bold text-muted uppercase">Drug License</div>
                            <div className="font-mono text-sm font-bold text-foreground">{profile.drug_license_number}</div>
                        </div>
                    </div>
                </div>

                {/* CONTACT & ADDRESS */}
                <div className="space-y-4">
                    <h4 className="text-xs font-bold text-muted uppercase tracking-wider border-b border-border pb-2">Location & contact</h4>

                    <div>
                        <div className="text-[10px] font-bold text-muted uppercase">Registered Address</div>
                        <div className="font-medium text-foreground text-sm opacity-80">
                            {profile.address_line_1}<br />
                            {profile.address_line_2 && <>{profile.address_line_2}<br /></>}
                            {profile.city}, {profile.state} - {profile.pincode}
                        </div>
                    </div>

                    <div className="bg-bg-primary p-3 rounded-lg border border-border">
                        <div className="flex justify-between items-center mb-1">
                            <div className="text-[10px] font-bold text-muted uppercase">Customer Support Phone</div>
                            {!isEditingPhone ? (
                                <button
                                    onClick={() => setIsEditingPhone(true)}
                                    className="text-[10px] font-black text-primary uppercase hover:underline"
                                >
                                    Edit
                                </button>
                            ) : (
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSavePhone}
                                        disabled={loading}
                                        className="text-[10px] font-black text-success uppercase hover:underline"
                                    >
                                        Save
                                    </button>
                                    <button
                                        onClick={() => setIsEditingPhone(false)}
                                        className="text-[10px] font-black text-muted uppercase hover:underline"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>

                        {isEditingPhone ? (
                            <input
                                className="w-full bg-bg-surface border border-border rounded-md px-2 py-1.5 font-mono font-bold text-sm"
                                value={phoneDraft}
                                onChange={e => setPhoneDraft(e.target.value)}
                            />
                        ) : (
                            <div className="font-mono text-lg font-black text-foreground-strong tracking-wide">
                                {profile.phone_number}
                            </div>
                        )}
                    </div>
                </div>


            </div>
        </div>
    );
};
