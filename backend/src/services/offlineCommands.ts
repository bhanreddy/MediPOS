import type { Request,Response,RequestHandler } from 'express';
import { createHash } from 'node:crypto';
import { createSaleHandler,createSaleReturnHandler } from '../routes/sales';
import { queryRaw,withPostgresTransaction,withPostgresSavepoint } from '../lib/postgresDb';
import { AppError } from '../lib/appError';
import { ZodError } from 'zod';
import { enforcePlan } from '../middleware/planEnforcement';

export function canonicalCommand(value:unknown):string {
 if(Array.isArray(value))return `[${value.map(canonicalCommand).join(',')}]`;
 if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalCommand((value as Record<string,unknown>)[key])}`).join(',')}}`;
 return JSON.stringify(value);
}
export interface OfflineCommand {command_id:string;device_id:string;type:'SALE'|'SALE_RETURN';payload:Record<string,unknown>}
/** Reuse canonical checkout and return handlers, including server-side validation. */
async function executeHandler(handler:RequestHandler,req:Request,body:Record<string,unknown>) {
 let result:any,status=200,failure:unknown;
 const response={status(code:number){status=code;return this;},json(value:unknown){result=value;return this;}};
 const child=Object.create(req) as Request;child.body=body;
 if(handler===createSaleHandler){child.originalUrl='/api/sales';await enforcePlan(child,response as Response,error=>{failure=error;});if(failure)throw failure;if(status>=400)throw new AppError(status,result?.error?.message||'Sale plan validation failed');}
 await handler(child,response as Response,error=>{failure=error;});
 if(failure)throw failure;if(status>=400)throw new AppError(status,result?.error?.message||'Command rejected');
 return result?.data;
}
export async function applyOfflineCommand(req:Request,command:OfflineCommand) {
 return withPostgresTransaction(async()=>{
  const clinic=req.user!.clinic_id!,actor=req.user!.id;
  const hash=createHash('sha256').update(canonicalCommand({type:command.type,payload:command.payload})).digest('hex');
  await queryRaw('SELECT pg_advisory_xact_lock(hashtextextended(?,0))',[`offline:${clinic}:${command.command_id}`]);
  const [existing]=await queryRaw('SELECT * FROM offline_command_inbox WHERE clinic_id=? AND command_id=?',[clinic,command.command_id]);
  if(existing){
   if(existing.actor_id!==actor||existing.payload_hash!==hash)throw new AppError(409,'Offline command identifier already belongs to different details','SYNC_IDENTITY_CONFLICT');
   return {...existing.result,command_id:command.command_id,status:existing.status,replayed:true};
  }
  await queryRaw(`INSERT INTO offline_command_inbox(clinic_id,command_id,actor_id,device_id,command_type,payload,payload_hash,status)
   VALUES(?,?,?,?,?,?::text::jsonb,?,'PROCESSING')`,[clinic,command.command_id,actor,command.device_id,command.type,JSON.stringify(command.payload),hash]);
  let result:Record<string,any>,status:'APPLIED'|'CONFLICT'|'REJECTED';
  try {
   if(command.type === 'SALE' && (command.payload.prescription_id || command.payload.dispensing_attestation)) {
    throw new AppError(409, 'Restricted dispensing requires a live pharmacist checkout.', 'RESTRICTED_DISPENSING_BLOCKED');
   }
   const data=await withPostgresSavepoint(()=>executeHandler(command.type==='SALE'?createSaleHandler:createSaleReturnHandler,req,{...command.payload,_local_id:command.command_id}));
   status='APPLIED';result={data};
  }catch(error){
   if(!(error instanceof AppError)&&!(error instanceof ZodError))throw error;
   status=error instanceof AppError&&error.status===409?'CONFLICT':'REJECTED';
   result={error:{code:error instanceof AppError?error.code:'INVALID_COMMAND',message:error instanceof ZodError?'Offline transaction payload is invalid':error.message}};
  }
  await queryRaw('UPDATE offline_command_inbox SET status=?,result=?::text::jsonb,completed_at=now() WHERE clinic_id=? AND command_id=?',[status,JSON.stringify(result),clinic,command.command_id]);
  return {...result,command_id:command.command_id,status,payload_hash:hash,replayed:false};
 });
}
