import axios from 'axios';
import { SecureStorage } from './secureStorage';
import { authEventEmitter } from './authEventEmitter';

let inFlight: Promise<string> | null = null;

/** Every caller settles on failure; no credentials are removed by a failed refresh. */
export async function refreshAccessToken(
  baseURL: string,
  failedToken?: string,
): Promise<string> {
  const current = await SecureStorage.getAccessToken();
  if (current && failedToken && current !== failedToken) return current;
  if (inFlight) return inFlight;
  const expected = SecureStorage.getRevision();
  const attempt = (async () => {
    const refreshToken = await SecureStorage.getRefreshToken();
    if (!refreshToken)
      throw new Error('Your saved session could not be refreshed.');
    const { data } = await axios.post(
      `${baseURL}/auth/refresh`,
      { refreshToken },
      { timeout: 15_000 },
    );
    const payload = data.data ?? data;
    const access = payload.accessToken;
    const refresh = payload.refreshToken ?? refreshToken;
    if (!(await SecureStorage.updateTokensIfCurrent(access, refresh, expected)))
      throw new Error('Session changed during refresh.');
    authEventEmitter.emit('TOKEN_REFRESHED', access);
    return access as string;
  })();
  inFlight = attempt;
  try {
    return await attempt;
  } finally {
    if (inFlight === attempt) inFlight = null;
  }
}
