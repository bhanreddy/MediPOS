import { useEffect,useState } from 'react';
import { useAuth } from '../lib/auth';
import { desktopQueueAvailable,offlineEntries,offlineSummary,syncOfflineCommands,type OfflineEntry,type OfflineSummary } from '../services/offlineCommandService';
import { Modal } from './ui/Modal';
export function SyncStatusBadge() {
 const user=useAuth(state=>state.user),clinic=useAuth(state=>state.clinic_id);
 const [summary,setSummary]=useState<OfflineSummary|null>(null),[entries,setEntries]=useState<OfflineEntry[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const refresh=async()=>{if(!desktopQueueAvailable()||!user||!clinic)return;try{const [counts,rows]=await Promise.all([offlineSummary(),offlineEntries()]);setSummary(counts);setEntries(rows);setError('');}catch(error){setError(String(error));}};
 useEffect(()=>{setSummary(null);setEntries([]);void refresh();const listener=()=>{void refresh();};window.addEventListener('medical-offline-queue',listener);window.addEventListener('online',listener);return()=>{window.removeEventListener('medical-offline-queue',listener);window.removeEventListener('online',listener);};},[user?.id,clinic]);
 if(!desktopQueueAvailable())return <span className="text-xs text-muted">Cloud</span>;
 const needsReview=(summary?.conflicts||0)+(summary?.rejected||0);
 const label=error?'Queue unavailable':!summary?'Checking sync…':needsReview?`${needsReview} need review`:summary.pending?`${summary.pending} pending sync`:'Synced';
 return <>
  <button type="button" onClick={()=>setOpen(true)} className={`rounded-full px-2 py-1 text-xs ${needsReview||error?'text-danger':summary?.pending?'text-warning':'text-success'}`}>{label}</button>
  <Modal isOpen={open} title="Desktop synchronization" onClose={()=>setOpen(false)}>
   <p className="mb-3 text-sm">Pending bills stay in this device’s SQLite queue until the server confirms them. Conflicts require review and are kept with their original details.</p>
   <button type="button" className="mb-3 rounded bg-primary px-4 py-2 text-on-primary disabled:opacity-50" disabled={busy||!summary?.pending} onClick={()=>{setBusy(true);void syncOfflineCommands().catch(error=>setError(String(error))).finally(()=>{setBusy(false);void refresh();});}}>{busy?'Synchronizing…':'Sync pending bills'}</button>
   {error&&<p role="alert" className="text-danger">{error}</p>}
   <div className="space-y-2">{entries.filter(entry=>entry.status!=='APPLIED').map(entry=><div className="rounded border border-border p-3 text-sm" key={entry.command_id}><strong>{entry.type} · {entry.status}</strong><p className="break-all text-xs text-muted">{entry.command_id}</p><p>{entry.result?.error?.message}</p>
    <button className="mt-1 text-xs text-primary" onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(entry,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`pending-bill-${entry.command_id}.json`;link.click();URL.revokeObjectURL(url);}}>Export for review</button></div>)}</div>
  </Modal>
 </>;
}
