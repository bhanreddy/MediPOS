import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { localMutate } from '../lib/localMutate';

export const devicesRouter = Router();

devicesRouter.post('/register', requireAuth, (req: any, res, next) => {
  try {
    const { expo_push_token, platform } = req.body;
    
    if (!expo_push_token || !platform) {
      return res.status(400).json({ error: 'Missing token or platform' });
    }

    localMutate({
      table: 'device_tokens',
      operation: 'INSERT',
      data: {
        clinic_id: req.user.clinic_id,
        user_id: req.user.id,
        expo_push_token,
        platform,
        is_active: 1
      }
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

devicesRouter.delete('/unregister', requireAuth, (req: any, res, next) => {
  try {
    const { expo_push_token } = req.body;
    
    if (!expo_push_token) {
      return res.status(400).json({ error: 'Missing token' });
    }

    localMutate({
      table: 'device_tokens',
      operation: 'DELETE',
      data: { _local_id: `${req.user.id}:${expo_push_token}` }
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
