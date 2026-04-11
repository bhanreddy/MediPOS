import { db } from '../db/index';
import type { AuthSession, User } from '../core/types';
import { store } from '../state/store';
import { authSlice } from '../state/slices';
import { v4 as uuidv4 } from 'uuid';
import { ShopProfileService } from './shopProfileService';
import { BootstrapService, ROLE_IDS } from './bootstrapService';
import { clearStockAlertPopupSession } from '../utils/stockAlertSession';

/**
 * PHASE 4: AUTH SERVICE
 * Handles Online/Offline Login & Session Management
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const AuthService = {
    /**
     * Helper to hash password for offline comparison (and initial storage).
     * Using simple SHA-256 for this local implementation. 
     * In prod, use bcrypt or stronger if possible, but WebCrypto is standard.
     */
    async hashPassword(password: string): Promise<string> {
        const msgBuffer = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    /**
     * 1. ONLINE LOGIN (Simulated for Phase 4, replace with Supabase later)
     * - Verify creds
     * - Fetch/Create User
     * - Store Password Hash locally
     * - Create Session
     */
    async loginOnline(username: string, password: string) {
        await BootstrapService.ensureSeed();

        // TODO: Replace with Supabase Auth
        // const { data, error } = await supabase.auth.signInWithPassword(...)

        // MOCK for Phase 4 Verification:
        // Check if user exists locally, if not create 'admin' for bootstrapping
        let user = await db.users.where('username').equals(username).first();
        const passwordHash = await this.hashPassword(password);

        if (!user) {
            if (username === 'admin') {
                // Bootstrap Admin
                user = {
                    id: uuidv4(),
                    username,
                    password_hash: passwordHash,
                    role_id: ROLE_IDS.ADMIN,
                    name: 'Administrator',
                    is_active: true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    last_modified: Date.now()
                };
                await db.users.add(user);
            } else {
                throw new Error('User not found (and not admin)');
            }
        } else {
            // Update hash if needed (simulating sync)
            if (user.password_hash !== passwordHash) {
                await db.users.update(user.id, { password_hash: passwordHash });
            }
        }

        // PHASE 9: Identity Sync
        // Fetch & Cache Shop Profile (Critical for Compliance)
        try {
            await ShopProfileService.syncShopProfile();
        } catch (err) {
            console.error('Failed to sync shop profile on login:', err);
            // Non-blocking? If no profile exists locally, we might warn user.
        }

        return this.createSession(user, false);
    },

    /**
     * 2. OFFLINE LOGIN
     * - Verify hash against local DB
     * - Create Session
     */
    async loginOffline(username: string, password: string) {
        await BootstrapService.ensureSeed();
        const user = await db.users.where('username').equals(username).first();
        if (!user) throw new Error('User not found locally');

        const passwordHash = await this.hashPassword(password);
        if (user.password_hash !== passwordHash) {
            throw new Error('Invalid credentials');
        }

        return this.createSession(user, true);
    },

    async createSession(user: User, isOffline: boolean, options?: { longLivedMs?: number }) {
        const role = await db.roles.get(user.role_id);
        const permissions = role?.permissions?.length ? [...role.permissions] : [];

        const ttl = options?.longLivedMs ?? ONE_DAY_MS;

        await db.auth_sessions.clear();

        const session: AuthSession = {
            id: uuidv4(),
            user_id: user.id,
            role_id: user.role_id,
            permissions,
            expires_at: Date.now() + ttl,
            is_offline_session: isOffline,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_modified: Date.now()
        };

        await db.auth_sessions.add(session);
        store.dispatch(authSlice.actions.loginSuccess({ user, session }));
        return session;
    },

    /**
     * 3. RESTORE SESSION on Boot
     */
    async restoreSession() {
        const now = Date.now();
        const candidates = await db.auth_sessions.filter(s => s.expires_at > now).toArray();
        if (candidates.length === 0) return false;
        candidates.sort((a, b) => b.expires_at - a.expires_at);
        const activeSession = candidates[0]!;
        const user = await db.users.get(activeSession.user_id);
        if (!user) return false;

        let session = activeSession;
        if (!session.permissions?.length) {
            const role = await db.roles.get(user.role_id);
            session = {
                ...session,
                permissions: role?.permissions?.length ? [...role.permissions] : [],
            };
        }
        store.dispatch(authSlice.actions.loginSuccess({ user, session }));
        return true;
    },

    async logout() {
        try {
            const { supabase } = await import('../lib/supabase');
            await supabase.auth.signOut();
        } catch {
            /* non-fatal */
        }
        try {
            const { clearAllAuthPersistence } = await import('../lib/store');
            await clearAllAuthPersistence();
        } catch {
            /* non-fatal */
        }
        await db.auth_sessions.clear();
        clearStockAlertPopupSession();
        store.dispatch(authSlice.actions.logout());
    }
};
