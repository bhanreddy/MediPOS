import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { transactionalRoute } from '../lib/transactionalRoute';
import { applyOfflineCommand } from '../services/offlineCommands';
import { queryRaw } from '../lib/postgresDb';
export const offlineRouter=Router();
const schema=z.object({command_id:z.string().uuid(),device_id:z.string().trim().min(1).max(100),type:z.enum(['SALE','SALE_RETURN']),payload:z.record(z.unknown())});
offlineRouter.post('/commands',requireAuth,requireRole('OWNER','PHARMACIST','CASHIER'),transactionalRoute(async(req,res,next)=>{
 try{res.json({data:await applyOfflineCommand(req,schema.parse(req.body))});}catch(error){next(error);}
}));
offlineRouter.get('/commands',requireAuth,async(req,res,next)=>{
 try{const data=await queryRaw('SELECT command_id,device_id,command_type,status,result,received_at,completed_at FROM offline_command_inbox WHERE clinic_id=? AND actor_id=? ORDER BY received_at DESC LIMIT 100',[req.user!.clinic_id!,req.user!.id]);res.json({data});}catch(error){next(error);}
});
