import { useQuery } from "@tanstack/react-query";
import api from "../../lib/api";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";

type StaffMember = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
};
export function StaffSettings() {
  const {
    data = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["clinic-staff"],
    queryFn: async () =>
      (await api.get<{ data: StaffMember[] }>("/clinics/users")).data.data,
  });
  return (
    <div className="p-6 max-w-4xl space-y-5">
      <h1 className="text-2xl font-semibold">Staff & access</h1>
      <p className="text-muted">
        People assigned to your pharmacy and their current access.
      </p>
      {isPending ? (
        <p role="status">Loading staff…</p>
      ) : isError ? (
        <Card className="p-5" role="alert">
          Could not load staff.{" "}
          <Button onClick={() => void refetch()}>Retry</Button>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                {["Name", "Phone", "Role", "Status"].map((label) => (
                  <th key={label} className="p-4">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-5 text-muted">
                    No staff assigned.
                  </td>
                </tr>
              ) : (
                data.map((person) => (
                  <tr key={person.id} className="border-t border-border">
                    <td className="p-4">
                      {person.full_name || "Unnamed staff member"}
                    </td>
                    <td className="p-4">{person.phone || "—"}</td>
                    <td className="p-4">{person.role}</td>
                    <td className="p-4">
                      {person.is_active === false ? "Inactive" : "Active"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
