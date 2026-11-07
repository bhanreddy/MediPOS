import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { applyOfflineCommand } from '../services/offlineCommands';
import { importIdentity } from '../lib/importIdentity';
import { requireRole } from '../middleware/rbac';
import { transactionalRoute } from '../lib/transactionalRoute';
import { AppError } from '../lib/appError';
import { queryRaw } from '../lib/postgresDb';

export const billsRouter = Router();

// GET /api/bills/recent
billsRouter.get('/recent', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.user?.clinic_id;
    if (!clinicId) {
      return res.status(400).json({ error: 'No clinic associated with this account.' });
    }

    const sales = await queryRaw(
      `SELECT s.id, s.invoice_number, s.net_amount, s.created_at, c.name as customer_name
       FROM sales s
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE s.clinic_id = ? AND s.deleted_at IS NULL AND s.is_return = false
       ORDER BY s.created_at DESC
       LIMIT 10`,
      [clinicId]
    );

    const formatted = sales.map((s: any) => ({
      id: s.id,
      invoice_number: s.invoice_number,
      net_amount: Number(s.net_amount),
      created_at: s.created_at,
      customers: {
        name: s.customer_name || 'Walk-in'
      }
    }));

    res.json({ data: formatted });
  } catch (err) {
    next(err);
  }
});


/** Legacy envelopes now enter the same durable command inbox as desktop sync. */
async function syncLegacyBill(req:Request,bill:Record<string,any>){
 const clientId=String(bill.client_id||bill.id||'');
 if(!clientId)throw new AppError(400,'client_id or id is required for idempotency');
 const items=Array.isArray(bill.items)?bill.items.map((item:any)=>({medicine_id:item.medicine_id||item.product_id,batch_id:item.batch_id,
  allocation_mode:item.batch_id?'manual':'auto',quantity:item.quantity,mrp:Number(item.mrp||item.unit_price||0),discount_pct:Number(item.discount_pct||0),gst_rate:Number(item.gst_rate||0)})):[];
 const payload={customer_id:bill.customer_id||null,payment_mode:String(bill.payment_mode||'cash').toLowerCase(),paid_amount:Number(bill.paid_amount??bill.final_amount??0),
  discount:Number(bill.discount||bill.discount_amount||0),items,legacy_invoice_number:bill.invoice_number,legacy_created_at:bill.created_at,
  ...(Number.isFinite(Number(bill.net_amount??bill.final_amount))?{expected_total_paise:Math.round(Number(bill.net_amount??bill.final_amount)*100)}:{})};
 return applyOfflineCommand(req,{command_id:importIdentity(req.user!.clinic_id!,`legacy-bill:${clientId}`),device_id:'legacy-desktop',type:'SALE',payload});
}
billsRouter.post('/sync',requireAuth,requireRole('OWNER','PHARMACIST','CASHIER'),transactionalRoute(async(req,res,next)=>{
 try{const result=await syncLegacyBill(req,req.body);res.json({success:result.status==='APPLIED',status:result.status,bill_id:result.data?.id,command_id:result.command_id,error:result.error});}catch(error){next(error);}
}));
billsRouter.post('/migrate',requireAuth,requireRole('OWNER'),transactionalRoute(async(req,res,next)=>{
 try{if(!Array.isArray(req.body.bills)||req.body.bills.length>100)throw new AppError(400,'Provide at most 100 bills');
  const results=[];for(const bill of req.body.bills){const result=await syncLegacyBill(req,bill);results.push({id:bill.id||bill.client_id,status:result.status,server_id:result.data?.id,error:result.error});}
  res.json({success:results.every(result=>result.status==='APPLIED'),results});
 }catch(error){next(error);}
}));
export default billsRouter;
