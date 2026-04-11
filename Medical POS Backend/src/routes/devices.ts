import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';

export const devicesRouter = Router();

devicesRouter.post('/register', requireAuth, async (req: any, res, next) => {
  try {
    const { expo_push_token, platform } = req.body;
    
    if (!expo_push_token || !platform) {
      return res.status(400).json({ error: 'Missing token or platform' });
    }

    const { error } = await supabaseAdmin
      .from('device_tokens')
      .upsert({
        clinic_id: req.user.clinic_id,
        user_id: req.user.id,
        expo_push_token,
        platform,
        is_active: true
      }, {
        onConflict: 'user_id,expo_push_token'
      });

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

devicesRouter.delete('/unregister', requireAuth, async (req: any, res, next) => {
  try {
    const { expo_push_token } = req.body;
    
    if (!expo_push_token) {
      return res.status(400).json({ error: 'Missing token' });
    }

    const { error } = await supabaseAdmin
      .from('device_tokens')
      .update({ is_active: false })
      .match({ user_id: req.user.id, expo_push_token });

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
