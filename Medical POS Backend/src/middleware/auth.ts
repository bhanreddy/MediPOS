import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../config/supabase';
import { AuthUser } from '../types';

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verifying JWT through Supabase Admin or secret
    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET || '');
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const userId = decoded.sub;

    // Fetch user details & clinic_id from DB
    const { data: userRow, error } = await supabaseAdmin
      .from('users')
      .select('clinic_id, role')
      .eq('id', userId)
      .single();

    if (error || !userRow) {
      return res.status(401).json({ error: 'User not found in system' });
    }

    let finalClinicId = userRow.clinic_id;
    let isImpersonating = false;

    // Impersonation logic
    if (userRow.role === 'SUPER_ADMIN') {
      const impersonateHeader = req.headers['x-impersonate-clinic'];
      if (impersonateHeader && typeof impersonateHeader === 'string') {
        finalClinicId = impersonateHeader;
        isImpersonating = true;
      }
    }

    req.user = {
      id: userId,
      clinic_id: finalClinicId,
      role: userRow.role as AuthUser['role'],
      email: decoded.email,
      isImpersonating
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole = (roles: AuthUser['role'][]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (req.user.role === 'SUPER_ADMIN') {
      return next(); 
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
};
