
export function SyncStatusBadge() {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-transparent text-success text-xs font-medium">
      <div className="w-1.5 h-1.5 rounded-full bg-success" />
      Synced
    </div>
  );
}
