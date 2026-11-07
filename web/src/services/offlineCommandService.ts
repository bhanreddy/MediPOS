import { invoke,isTauri } from '@tauri-apps/api/core';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
export interface OfflineCommand {command_id:string;device_id:string;type:'SALE'|'SALE_RETURN';payload:Record<string,unknown>}
export interface OfflineEntry extends OfflineCommand {status:'PENDING'|'APPLIED'|'CONFLICT'|'REJECTED'|'RESOLVED';result?:{error?:{message?:string}};attempts:number}
export interface OfflineSummary {pending:number;conflicts:number;rejected:number;applied:number}
function scope(){const auth=useAuth.getState(),clinic=sessionStorage.getItem('impersonate_clinic_id')||auth.clinic_id;if(!auth.user?.id||!clinic)throw new Error('Choose a signed-in pharmacy account.');return {user_id:auth.user.id,clinic_id:clinic};}
const changed=()=>window.dispatchEvent(new Event('medical-offline-queue'));
function deviceId(){let id=localStorage.getItem('medical_offline_device_id');if(!id){id=crypto.randomUUID();localStorage.setItem('medical_offline_device_id',id);}return id;}
export const desktopQueueAvailable=()=>isTauri();
export async function queueOfflineCommand(command:Omit<OfflineCommand,'device_id'>){
 if(!isTauri())throw new Error('The durable offline queue is available in the desktop application.');
 await invoke('queue_offline_command',{scope:scope(),command:{...command,device_id:deviceId()}});changed();
}
export async function offlineSummary():Promise<OfflineSummary>{return invoke('offline_queue_summary',{scope:scope()});}
export async function offlineEntries(pendingOnly=false):Promise<OfflineEntry[]>{return invoke('list_offline_commands',{scope:scope(),pendingOnly});}
let syncing:Promise<void>|null=null;
export function syncOfflineCommands():Promise<void>{
 if(syncing)return syncing;
 syncing=(async()=>{
  const identity=scope(),matches=()=>JSON.stringify(scope())===JSON.stringify(identity);
  const entries=await offlineEntries(true);
  for(const entry of entries){
   if(!matches())break;
   let result:Record<string,unknown>;
   try {
    const response=await api.post('/offline/commands',{command_id:entry.command_id,device_id:entry.device_id,type:entry.type,payload:entry.payload},{'axios-retry':{retries:0}});
    result=response.data?.data;
    if(result?.command_id!==entry.command_id||!['APPLIED','CONFLICT','REJECTED'].includes(String(result?.status)))throw new Error('The server did not provide a valid synchronization receipt.');
   }catch(error:any){
    result={command_id:entry.command_id,status:'PENDING',error:{message:error.response?.data?.error?.message||error.message||'Network unavailable'}};
   }
   await invoke('record_offline_result',{scope:identity,commandId:entry.command_id,result});changed();
   if(result.status==='PENDING')break;
  }
 })().finally(()=>{syncing=null;changed();});
 return syncing;
}
