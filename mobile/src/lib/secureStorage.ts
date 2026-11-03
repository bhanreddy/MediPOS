import * as SecureStore from 'expo-secure-store';

const KEYS = {
  SESSION: 'med_pos_session_v2',
  ACCESS_TOKEN: 'med_pos_access_token',
  REFRESH_TOKEN: 'med_pos_refresh_token',
  USER: 'med_pos_user',
} as const;
type Tokens = { accessToken: string; refreshToken: string };
let tokens: Tokens | null | undefined;
let user: object | null | undefined;
let revision = 0;
let rememberSession = true;
let writes: Promise<unknown> = Promise.resolve();
let reading: Promise<Tokens | null> | null = null;

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const result = writes.then(work);
  writes = result.catch(() => undefined);
  return result;
}
function validTokens(value: unknown): value is Tokens {
  const pair = value as Tokens | null;
  return (
    !!pair &&
    typeof pair.accessToken === 'string' &&
    !!pair.accessToken &&
    typeof pair.refreshToken === 'string' &&
    !!pair.refreshToken
  );
}
async function readTokens(): Promise<Tokens | null> {
  await writes;
  if (tokens !== undefined) return tokens;
  if (!rememberSession) return null;
  if (reading) return reading;
  const expected = revision;
  reading = (async () => {
    // Do not treat a storage read failure as an empty signed-out session.
    const raw = await SecureStore.getItemAsync(KEYS.SESSION);
    let loaded: Tokens | null = null;
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (validTokens(parsed)) loaded = parsed;
    } else {
      const [accessToken, refreshToken] = await Promise.all([
        SecureStore.getItemAsync(KEYS.ACCESS_TOKEN),
        SecureStore.getItemAsync(KEYS.REFRESH_TOKEN),
      ]);
      if (accessToken && refreshToken) loaded = { accessToken, refreshToken };
    }
    if (expected === revision) tokens = loaded;
    return tokens ?? null;
  })();
  try {
    return await reading;
  } finally {
    reading = null;
  }
}

export const SecureStorage = {
  getRevision: () => revision,
  /** Unchecked Remember me retains credentials only until this app process ends. */
  async setSessionPersistence(remember: boolean): Promise<void> {
    const expected = ++revision;
    await enqueue(async () => {
      if (expected !== revision) throw new Error('Session changed before login completed.');
      await Promise.all(Object.values(KEYS).map(key => SecureStore.deleteItemAsync(key)));
      rememberSession = remember;
      tokens = null;
      user = null;
    });
  },
  async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    const pair = { accessToken, refreshToken };
    if (!validTokens(pair))
      throw new Error(
        'The server returned an incomplete session. Please retry.',
      );
    const expected = ++revision;
    await enqueue(async () => {
      if (expected !== revision)
        throw new Error('Session changed before login completed.');
      // One write keeps rotating access/refresh tokens together across app restarts.
      if (rememberSession) await SecureStore.setItemAsync(KEYS.SESSION, JSON.stringify(pair));
      if (expected !== revision)
        throw new Error('Session changed before login completed.');
      tokens = pair;
    });
  },
  async updateTokensIfCurrent(
    accessToken: string,
    refreshToken: string,
    expected: number,
  ): Promise<boolean> {
    const pair = { accessToken, refreshToken };
    if (!validTokens(pair))
      throw new Error('The server returned an incomplete session.');
    return enqueue(async () => {
      if (expected !== revision) return false;
      if (rememberSession) await SecureStore.setItemAsync(KEYS.SESSION, JSON.stringify(pair));
      if (expected !== revision) return false;
      tokens = pair;
      return true;
    });
  },
  async getAccessToken(): Promise<string | null> {
    return (await readTokens())?.accessToken ?? null;
  },
  async getRefreshToken(): Promise<string | null> {
    return (await readTokens())?.refreshToken ?? null;
  },
  async saveUser(value: object): Promise<void> {
    const expected = revision;
    await enqueue(async () => {
      if (expected !== revision) return;
      if (rememberSession) await SecureStore.setItemAsync(KEYS.USER, JSON.stringify(value));
      if (expected === revision) user = value;
    });
  },
  async getUser(): Promise<object | null> {
    await writes;
    if (user !== undefined) return user;
    if (!rememberSession) return null;
    const expected = revision;
    const raw = await SecureStore.getItemAsync(KEYS.USER);
    const loaded = raw ? (JSON.parse(raw) as object) : null;
    if (expected === revision) user = loaded;
    return user ?? null;
  },
  async clearAll(): Promise<void> {
    ++revision;
    tokens = null;
    user = null;
    await enqueue(async () => {
      await Promise.all(
        Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key)),
      );
    });
  },
};
