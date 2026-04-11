import { Router } from 'express';
import express from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { supabaseAdmin } from '../config/supabase';
import { createRazorpayCustomer, createSubscription, cancelSubscription, verifyWebhookSignature } from '../services/razorpay';

export const subscriptionsRouter = Router();

// GET /api/subscriptions/plans
subscriptionsRouter.get('/plans', async (req, res, next) => {
  try {
    const { data: plans, error } = await supabaseAdmin
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price_monthly', { ascending: true });

    if (error) throw error;
    res.json({ data: plans });
  } catch (err) {
    next(err);
  }
});

// GET /api/subscriptions/current
subscriptionsRouter.get('/current', requireAuth, async (req, res, next) => {
  try {
    const { data: sub, error } = await supabaseAdmin
      .from('clinic_subscriptions')
      .select('*')
      .eq('clinic_id', req.user!.clinic_id!)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows

    const { data: plan } = sub ? await supabaseAdmin
      .from('subscription_plans')
      .select('*')
      .eq('name', sub.plan_name)
      .single() : { data: null };

    res.json({ data: { subscription: sub, plan } });
  } catch (err) {
    next(err);
  }
});

// POST /api/subscriptions/create
subscriptionsRouter.post('/create', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const { plan_name, billing_cycle } = req.body;
    
    // 1. Get exact plan definition
    const { data: plan, error: planErr } = await supabaseAdmin
      .from('subscription_plans')
      .select('*')
      .eq('name', plan_name)
      .single();

    if (planErr || !plan) {
      return res.status(400).json({ error: { message: 'Invalid plan selected' } });
    }

    const razorpayPlanId = billing_cycle === 'annual' ? plan.razorpay_plan_id_annual : plan.razorpay_plan_id_monthly;
    
    if (!razorpayPlanId) {
       return res.status(400).json({ error: { message: 'Plan not fully configured for this cycle' } });
    }

    // 2. See if clinic already has a customer ID
    let customerId;
    const { data: existingSub } = await supabaseAdmin
      .from('clinic_subscriptions')
      .select('razorpay_customer_id')
      .eq('clinic_id', req.user!.clinic_id!)
      .not('razorpay_customer_id', 'is', null)
      .limit(1)
      .single();

    if (existingSub?.razorpay_customer_id) {
      customerId = existingSub.razorpay_customer_id;
    } else {
      const { data: clinic } = await supabaseAdmin.from('clinics').select('*').eq('id', req.user!.clinic_id!).single();
      customerId = await createRazorpayCustomer({
        name: clinic.name,
        email: clinic.email || 'clinic@example.com',
        phone: clinic.phone || '9999999999',
        clinicId: clinic.id
      });
    }

    // 3. Create Subscription
    const rpSub = await createSubscription({
      razorpayPlanId,
      razorpayCustomerId: customerId,
      clinicId: req.user!.clinic_id! as string
    });

    // 4. Insert row
    const { data: dbSub, error: insertErr } = await supabaseAdmin
      .from('clinic_subscriptions')
      .insert({
        clinic_id: req.user!.clinic_id!,
        plan_name: plan_name,
        razorpay_subscription_id: rpSub.id,
        razorpay_customer_id: customerId,
        status: 'created',
        billing_cycle
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    res.json({ data: { subscription_id: dbSub.id, razorpay_subscription_id: rpSub.id, short_url: rpSub.short_url } });
  } catch (err) {
    next(err);
  }
});

// GET /api/subscriptions/invoices
subscriptionsRouter.get('/invoices', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const { data: invoices, error } = await supabaseAdmin
      .from('subscription_invoices')
      .select('*')
      .eq('clinic_id', req.user!.clinic_id!)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ data: invoices });
  } catch (err) {
    next(err);
  }
});

// POST /api/subscriptions/cancel
subscriptionsRouter.post('/cancel', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const { razorpay_subscription_id } = req.body;
    
    // Validate it belongs to this clinic
    const { data: sub } = await supabaseAdmin
      .from('clinic_subscriptions')
      .select('*')
      .eq('razorpay_subscription_id', razorpay_subscription_id)
      .eq('clinic_id', req.user!.clinic_id!)
      .single();

    if (!sub) return res.status(404).json({ error: { message: 'Subscription not found' } });

    await cancelSubscription(razorpay_subscription_id, true);

    await supabaseAdmin
      .from('clinic_subscriptions')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', sub.id);

    res.json({ data: { message: 'Subscription cancelled successfully at end of cycle' } });
  } catch (err) {
    next(err);
  }
});

// POST /api/subscriptions/webhook
subscriptionsRouter.post('/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const bodyStr = req.body.toString('utf8');

    if (!verifyWebhookSignature(bodyStr, signature)) {
      return res.status(400).send('Invalid signature');
    }

    const payload = JSON.parse(bodyStr);
    const event = payload.event;
    const subEntity = payload.payload?.subscription?.entity;
    const paymentEntity = payload.payload?.payment?.entity;

    if (!subEntity) return res.status(200).send('No subscription payload');

    const statusMap: Record<string, string> = {
      'subscription.activated': 'active',
      'subscription.charged': 'active',
      'subscription.halted': 'paused',
      'subscription.cancelled': 'cancelled',
      'subscription.completed': 'expired'
    };

    const newStatus = statusMap[event];
    
    // Verify idempotency: Have we already processed this invoice?
    if (event === 'subscription.charged') {
        const { data: existingInvoice } = await supabaseAdmin.from('subscription_invoices')
          .select('id').eq('razorpay_invoice_id', paymentEntity?.invoice_id).single();
        
        if (existingInvoice) {
           return res.status(200).send('Already processed');
        }
    }

    if (newStatus) {
      await supabaseAdmin.from('clinic_subscriptions')
        .update({ 
           status: newStatus,
           current_period_start: subEntity.current_start ? new Date(subEntity.current_start * 1000).toISOString() : undefined,
           current_period_end: subEntity.current_end ? new Date(subEntity.current_end * 1000).toISOString() : undefined,
        })
        .eq('razorpay_subscription_id', subEntity.id);
    }

    if (event === 'subscription.charged') {
      const { data: subRow } = await supabaseAdmin.from('clinic_subscriptions')
         .select('id, clinic_id').eq('razorpay_subscription_id', subEntity.id).single();
      
      if (subRow) {
         await supabaseAdmin.from('subscription_invoices').insert({
            clinic_id: subRow.clinic_id,
            subscription_id: subRow.id,
            razorpay_invoice_id: paymentEntity?.invoice_id,
            razorpay_payment_id: paymentEntity?.id,
            amount: paymentEntity?.amount / 100, // convert paise to INR
            status: 'paid',
            paid_at: new Date(paymentEntity?.created_at * 1000).toISOString()
         });
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Razorpay Webhook Error:', err);
    res.status(500).send('Internal Server Error');
  }
});
