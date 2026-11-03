import { useEffect, useState } from "react";
import api from "../../lib/api";
import { clearClinicProfileCache } from '../../services/clinicProfileCache';
import { useAuth } from "../../lib/auth";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import toast from "react-hot-toast";

type Profile = {
  name: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  drug_licence_number: string;
  invoice_footer: string;
  upi_vpa: string;
};
const empty: Profile = {
  name: "",
  phone: "",
  email: "",
  address: "",
  gstin: "",
  drug_licence_number: "",
  invoice_footer: "",
  upi_vpa: "",
};
export function ClinicProfileSettings({
  invoiceOnly = false,
}: {
  invoiceOnly?: boolean;
}) {
  const { isOwner, isSuperAdmin } = useAuth();
  const [profile, setProfile] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/clinics/me");
      setProfile({ ...empty, ...data.data });
    } catch {
      setError("Could not load your clinic profile. Please retry.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.put("/clinics/me", Object.fromEntries(fields.map(([key]) => [key, profile[key]])));
      clearClinicProfileCache();
      toast.success("Settings saved");
      window.dispatchEvent(new CustomEvent("medpos:shop-profile-updated"));
    } catch {
      setError("Could not save settings. Please retry.");
    } finally {
      setSaving(false);
    }
  };
  const fields: Array<[keyof Profile, string]> = invoiceOnly
    ? [
        ["invoice_footer", "Invoice footer"],
        ["upi_vpa", "UPI ID"],
      ]
    : [
        ["name", "Clinic name"],
        ["phone", "Phone"],
        ["email", "Email"],
        ["address", "Address"],
        ["gstin", "GSTIN"],
        ["drug_licence_number", "Drug licence number"],
      ];
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <h1 className="text-2xl font-bold">
        {invoiceOnly ? "Invoice settings" : "Clinic settings"}
      </h1>
      <p className="text-muted">
        {invoiceOnly
          ? "Manage the details shown on your invoices."
          : "Keep your business and contact details up to date."}
      </p>
      {error && (
        <Card className="p-4 text-danger" role="alert">
          {error}
          <Button className="ml-3" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      )}
      {loading ? (
        <p role="status">Loading settings…</p>
      ) : (
        <Card className="p-6">
          <form onSubmit={save} className="space-y-5">
            {fields.map(([key, label]) => (
              <Input
                key={key}
                label={label}
                value={profile[key] || ""}
                type={key === "email" ? "email" : "text"}
                required={key === "name"}
                maxLength={key === "invoice_footer" ? 2000 : 250}
                onChange={(event) =>
                  setProfile({ ...profile, [key]: event.target.value })
                }
                disabled={!isOwner && !isSuperAdmin}
              />
            ))}
            <Button
              type="submit"
              isLoading={saving}
              disabled={!isOwner && !isSuperAdmin}
            >
              Save settings
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
