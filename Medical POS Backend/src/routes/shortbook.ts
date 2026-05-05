import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { addToShortbookSchema } from '../schemas/shortbook.schema';
import { localMutate } from '../lib/localMutate';
import { queryAll } from '../lib/localQuery';

export const shortbookRouter = Router();

// GET /api/shortbook
shortbookRouter.get('/', requireAuth, (req, res, next) => {
  try {
    const data = queryAll('shortbook', 'is_ordered=0');
    data.sort((a: any, b: any) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/shortbook
shortbookRouter.post('/', requireAuth, (req, res, next) => {
  try {
    const parsed = addToShortbookSchema.parse(req.body);
    const payload = { ...parsed, clinic_id: req.user!.clinic_id! };

    const data = localMutate({ table: 'shortbook', operation: 'INSERT', data: payload });

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/shortbook/:id/ordered
shortbookRouter.patch('/:id/ordered', requireAuth, requireRole('OWNER'), (req, res, next) => {
  try {
    const data = localMutate({
      table: 'shortbook',
      operation: 'UPDATE',
      data: { is_ordered: true, ordered_at: new Date().toISOString(), _local_id: req.params.id }
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/shortbook/:id
shortbookRouter.delete('/:id', requireAuth, requireRole('OWNER'), (req, res, next) => {
  try {
    localMutate({ table: 'shortbook', operation: 'DELETE', data: { _local_id: req.params.id } });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default shortbookRouter;
