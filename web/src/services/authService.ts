import { useAuth } from '../lib/auth';

/** All explicit sign-out buttons clear both auth stores and persistent credentials. */
export const AuthService = {
  logout: () => useAuth.getState().signOut(),
};
