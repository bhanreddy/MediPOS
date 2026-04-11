import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { supabaseAdmin } from '../config/supabase';
import { createMedicineSchema, updateMedicineSchema } from '../schemas/medicine.schema';
import { auditLog } from '../services/auditLog';

export const inventoryRouter = Router();

// GET /api/inventory/medicines/search?q= &barcode=
inventoryRouter.get('/medicines/search', requireAuth, async (req, res, next) => {
  try {
    const q = (req.query.q as string) || '';
    const barcode = (req.query.barcode as string) || '';

    if (barcode) {
      const { data: exact, error: e1 } = await supabaseAdmin
        .from('medicines')
        .select('*, medicine_stock(total_stock), medicine_batches(*)')
        .eq('clinic_id', req.user!.clinic_id!)
        .eq('is_active', true)
        .eq('barcode', barcode)
        .limit(5);

      if (e1) throw e1;

      const results = exact || [];
      const matchedNames = results.map((r) => r.generic_name).filter(Boolean);
      let substitutes: any[] = [];
      if (matchedNames.length > 0) {
        const { data: subsData } = await supabaseAdmin
          .from('medicines')
          .select('*, medicine_stock!inner(total_stock)')
          .eq('clinic_id', req.user!.clinic_id!)
          .eq('is_active', true)
          .in('generic_name', matchedNames as string[])
          .gt('medicine_stock.total_stock', 0);
        if (subsData) {
          const resultIds = results.map((r) => r.id);
          substitutes = subsData.filter((sub) => !resultIds.includes(sub.id));
        }
      }
      return res.json({ results, substitutes });
    }

    if (!q) {
      return res.json({ results: [], substitutes: [] });
    }

    const { data: results, error } = await supabaseAdmin
      .from('medicines')
      .select('*, medicine_stock(total_stock), medicine_batches(*)')
      .eq('clinic_id', req.user!.clinic_id!)
      .eq('is_active', true)
      .or(`name.ilike.%${q}%,generic_name.ilike.%${q}%`);

    if (error) throw error;

    const matchedNames = results.map(r => r.generic_name).filter(Boolean);
    let substitutes: any[] = [];

    if (matchedNames.length > 0) {
      const { data: subsData } = await supabaseAdmin
        .from('medicines')
        .select('*, medicine_stock!inner(total_stock)')
        .eq('clinic_id', req.user!.clinic_id!)
        .eq('is_active', true)
        .in('generic_name', matchedNames)
        .gt('medicine_stock.total_stock', 0);

      if (subsData) {
        const resultIds = results.map(r => r.id);
        substitutes = subsData.filter(sub => !resultIds.includes(sub.id));
      }
    }

    res.json({ results, substitutes });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/medicines
inventoryRouter.get('/medicines', requireAuth, async (req, res, next) => {
  try {
    const q = req.query.q as string;
    const category = req.query.category as string;
    const lowStock = req.query.low_stock === 'true';
    const scheduleH1 = req.query.schedule_h1 === 'true';

    let query = supabaseAdmin
      .from('medicines')
      .select('*, medicine_stock(total_stock)')
      .eq('clinic_id', req.user!.clinic_id!)
      .eq('is_active', true);

    if (q) query = query.or(`name.ilike.%${q}%,generic_name.ilike.%${q}%`);
    if (category) query = query.eq('category', category);
    if (scheduleH1) query = query.eq('is_schedule_h1', true);

    const { data: rawData, error } = await query;
    if (error) throw error;

    let data = rawData;
    if (lowStock) {
      data = rawData.filter(d => {
        const stock = d.medicine_stock?.[0]?.total_stock || 0;
        return stock <= d.low_stock_threshold;
      });
    }

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/medicines/:id
inventoryRouter.get('/medicines/:id', requireAuth, async (req, res, next) => {
  try {
    const { data: medicine, error } = await supabaseAdmin
      .from('medicines')
      .select('*')
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    if (!medicine) {
      return res.status(404).json({ error: { message: 'Medicine not found', code: 'NOT_FOUND' } });
    }

    const { data: batches } = await supabaseAdmin
      .from('medicine_batches')
      .select('*')
      .eq('medicine_id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .order('expiry_date', { ascending: true });

    res.json({ data: { ...medicine, batches: batches || [] } });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/medicines
inventoryRouter.post('/medicines', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const parsed = createMedicineSchema.parse(req.body);
    const payload = { ...parsed, clinic_id: req.user!.clinic_id! };

    const { data, error } = await supabaseAdmin
      .from('medicines')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    await auditLog({ 
      clinicId: req.user!.clinic_id!, 
      userId: req.user!.id, 
      action: 'CREATE', 
      table: 'medicines', 
      newData: data 
    });

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/inventory/medicines/:id
inventoryRouter.put('/medicines/:id', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const parsed = updateMedicineSchema.parse(req.body);
    const payload = { ...parsed, clinic_id: req.user!.clinic_id! };

    const { data, error } = await supabaseAdmin
      .from('medicines')
      .update(payload)
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .eq('is_active', true)
      .select()
      .single();

    if (error) throw error;

    await auditLog({ 
      clinicId: req.user!.clinic_id!, 
      userId: req.user!.id, 
      action: 'UPDATE', 
      table: 'medicines', 
      newData: data,
      recordId: req.params.id
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/inventory/medicines/:id
inventoryRouter.delete('/medicines/:id', requireAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('medicines')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .eq('clinic_id', req.user!.clinic_id!)
      .select()
      .single();

    if (error) throw error;

    await auditLog({ 
      clinicId: req.user!.clinic_id!, 
      userId: req.user!.id, 
      action: 'DELETE', 
      table: 'medicines', 
      newData: data,
      recordId: req.params.id
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/batches
inventoryRouter.get('/batches', requireAuth, async (req, res, next) => {
  try {
    const medicineId = req.query.medicine_id as string;
    if (!medicineId) {
      return res.status(400).json({ error: 'medicine_id is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('medicine_batches')
      .select('*')
      .eq('medicine_id', medicineId)
      .eq('clinic_id', req.user!.clinic_id!)
      .order('expiry_date', { ascending: true });

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/batches/expiring
inventoryRouter.get('/batches/expiring', requireAuth, async (req, res, next) => {
  try {
    const days = parseInt(req.query.days as string) || 90;
    const { data, error } = await supabaseAdmin
      .from('expiry_alerts')
      .select('*')
      .eq('clinic_id', req.user!.clinic_id!);

    if (error) throw error;
    
    // Filtering down by days locally if required, since view is 90 days
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + days);

    const filtered = data.filter(r => new Date(r.expiry_date) <= maxDate);
    
    res.json({ data: filtered });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/stock/low
inventoryRouter.get('/stock/low', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('low_stock_alerts')
      .select('*')
      .eq('clinic_id', req.user!.clinic_id!);

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/stock/summary
inventoryRouter.get('/stock/summary', requireAuth, async (req, res, next) => {
  try {
    const { data: medicines } = await supabaseAdmin
      .from('medicines')
      .select('id')
      .eq('clinic_id', req.user!.clinic_id!)
      .eq('is_active', true);

    const { data: batches } = await supabaseAdmin
      .from('medicine_batches')
      .select('quantity_remaining, purchase_price')
      .eq('clinic_id', req.user!.clinic_id!)
      .gt('quantity_remaining', 0);

    let totalStockValue = 0;
    if (batches) {
      totalStockValue = batches.reduce((acc, b) => acc + (b.quantity_remaining * b.purchase_price), 0);
    }

    res.json({
      data: {
        total_medicines: medicines?.length || 0,
        total_batches: batches?.length || 0,
        total_stock_value: totalStockValue
      }
    });
  } catch (err) {
    next(err);
  }
});

export default inventoryRouter;
