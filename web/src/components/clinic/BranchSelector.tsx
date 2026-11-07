import { Building2 } from 'lucide-react';

export interface BranchOption {
  id: string;
  name: string;
  store_code: string;
}

export function BranchSelector({ branches, value, onChange, label = 'Active branch' }: {
  branches: BranchOption[];
  value: string | null;
  onChange: (id: string) => void;
  label?: string;
}) {
  if (!branches.length) return null;
  return <label className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5">
    <Building2 size={16} className="shrink-0 text-muted" aria-hidden />
    <span className="sr-only">{label}</span>
    <select value={value ?? ''} onChange={event => onChange(event.target.value)} aria-label={label}
      className="max-w-32 truncate bg-surface text-xs font-semibold text-foreground sm:max-w-48">
      {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
    </select>
  </label>;
}
