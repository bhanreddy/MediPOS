import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Building2,
  Camera,
  MapPin,
  Phone,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "../../lib/auth";
import { ShopProfileService } from "../../services/shopProfileService";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

export function ShopProfileSettingsCard() {
  const scope = useAuth((s) => `${s.user?.id}:${s.clinic_id}`);
  const canEdit = useAuth((s) => s.isOwner || s.isSuperAdmin);
  const query = useQuery({
    queryKey: ["settings-shop-profile", scope],
    queryFn: () => ShopProfileService.getShopProfileLocal(),
    staleTime: 0,
    retry: false,
  });
  const profile = query.data;
  const logoInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function updateLogo(file?: File) {
    if (!file || saving) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setError("Choose a PNG, JPG or WebP image smaller than 2 MB.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read this image."));
        reader.readAsDataURL(file);
      });
      await ShopProfileService.updateLogo(data);
      await query.refetch();
      window.dispatchEvent(new CustomEvent("medpos:shop-profile-updated"));
    } catch {
      setError("Could not update the logo. Please retry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card id="business" className="scroll-mt-6 p-5 sm:p-6">
      {query.isPending ? (
        <p role="status" className="text-sm text-muted">
          Loading business profile…
        </p>
      ) : query.isError || !profile ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-sm text-muted">
            Could not load your business profile.
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
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <button
                type="button"
                onClick={() => logoInput.current?.click()}
                disabled={!canEdit || saving}
                aria-label="Change business logo"
                className="group relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-primary/5 text-primary focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default"
              >
                {profile.logo_url ? (
                  <img
                    src={profile.logo_url}
                    alt="Business logo"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Building2 size={26} aria-hidden />
                )}
                {canEdit && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Camera size={20} aria-hidden />
                  </span>
                )}
              </button>
              <input
                ref={logoInput}
                type="file"
                className="hidden"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  void updateLogo(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <div className="min-w-0">
                <h2 className="break-words text-lg font-bold text-foreground-strong">
                  {profile.medical_name}
                </h2>
                <div className="mt-1.5">
                  <Badge variant={profile.verified ? "success" : "neutral"}>
                    {profile.verified ? "Active business" : "Business profile"}
                  </Badge>
                </div>
              </div>
            </div>
            <Link
              to="/settings/clinic"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-surface-elevated"
            >
              {canEdit ? "Edit business profile" : "View business profile"}
              <ArrowUpRight size={14} aria-hidden />
            </Link>
          </div>
          <dl className="mt-5 grid min-w-0 gap-5 border-t border-border pt-5 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Owner / licence holder", profile.owner_name || "Not provided"],
              ["GST number", profile.gst_number || "Not provided"],
              ["Drug licence", profile.drug_license_number || "Not provided"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="mt-1.5 break-words text-sm font-semibold">
                  {value}
                </dd>
              </div>
            ))}
            <div className="space-y-2 text-xs text-muted">
              <p className="flex items-start gap-2">
                <Phone size={14} className="shrink-0" aria-hidden />
                <span className="break-all">
                  {profile.phone_number || "No phone number"}
                </span>
              </p>
              <p className="flex items-start gap-2">
                <MapPin size={14} className="shrink-0" aria-hidden />
                <span className="break-words">
                  {[
                    profile.address_line_1,
                    profile.address_line_2,
                    profile.city,
                    profile.state,
                    profile.pincode,
                  ]
                    .filter(Boolean)
                    .join(", ") || "No address provided"}
                </span>
              </p>
            </div>
          </dl>
        </>
      )}
      {saving && (
        <p role="status" className="mt-3 text-xs text-muted">
          Updating logo…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
