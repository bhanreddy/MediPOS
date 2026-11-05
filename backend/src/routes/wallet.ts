import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { transactionalRoute } from '../lib/transactionalRoute';
import { WalletService } from '../services/wallet/walletService';
import { getCoinPolicy, setCoinPolicy } from '../services/wallet/coinPolicy';
import { AppError } from '../lib/appError';

export const walletRouter=Router();
walletRouter.use(requireAuth,requireRole('OWNER','PHARMACIST','CASHIER'));
walletRouter.use((req,_res,next)=>req.user?.clinic_id?next():next(new AppError(403,'A medical store is required')));
const context=(req:Request)=>({clinicId:req.user!.clinic_id!,customerId:req.params.customerId,actorId:req.user!.id});
const reason=z.string().trim().min(3).max(500);
const policySchema=z.object({version:z.number().int().min(0),enabled:z.boolean(),rate_bps:z.number().int().min(500).max(1000),minimum_sale_paise:z.number().int().min(0).max(1000000000),earning_cap_paise:z.number().int().min(0).max(1000000000),redemption_limit_percent:z.number().int().min(0).max(100),expiry_days:z.number().int().min(1).max(365),reason}).strict();
walletRouter.get('/settings',async(req,res,next)=>{try{res.json({data:await getCoinPolicy(req.user!.clinic_id!)});}catch(error){next(error)}});
walletRouter.put('/settings',requireRole('OWNER'),transactionalRoute(async(req,res,next)=>{try{const input=policySchema.parse(req.body);res.json({data:await setCoinPolicy(req.user!.clinic_id!,req.user!.id,input)});}catch(error){next(error)}}));
walletRouter.get('/:customerId',async(req,res,next)=>{try{
  z.string().uuid().parse(req.params.customerId);
  const page=z.coerce.number().int().min(1).max(100000).parse(req.query.page||1);
  res.json({data:await WalletService.get(context(req),page)});
}catch(error){next(error)}});
// Nex Coins cannot be issued or adjusted manually through the API.
