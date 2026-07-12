import { create } from 'zustand';

export type NcmProfile = {
  nickname: string;
  avatarUrl?: string;
  uid: number;
};

export type NcmAuthStatus = 'guest' | 'pending' | 'scanned' | 'authed';

type StoredSession = {
  cookie: string | null;
  profile: NcmProfile | null;
};

type AuthStore = StoredSession & {
  status: NcmAuthStatus;
  setStatus: (status: NcmAuthStatus) => void;
  setSession: (cookie: string, profile?: NcmProfile | null) => void;
  setProfile: (profile: NcmProfile | null) => void;
  clearSession: () => void;
  restore: () => Promise<void>;
  logout: () => Promise<void>;
};

const STORAGE_KEY = 'nostalgia.ncm.session';

const readStoredSession = (): StoredSession => {
  if (typeof window === 'undefined') return { cookie: null, profile: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { cookie: null, profile: null };
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    return {
      cookie: typeof parsed.cookie === 'string' ? parsed.cookie : null,
      profile: parsed.profile && typeof parsed.profile.uid === 'number'
        ? {
            uid: parsed.profile.uid,
            nickname: String(parsed.profile.nickname ?? ''),
            avatarUrl: typeof parsed.profile.avatarUrl === 'string' ? parsed.profile.avatarUrl : undefined,
          }
        : null,
    };
  } catch {
    return { cookie: null, profile: null };
  }
};

const persist = (session: StoredSession) => {
  if (typeof window === 'undefined') return;
  if (!session.cookie) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

export const sanitizeNcmCookie = (raw: string | null | undefined) => {
  if (!raw) return null;
  const allowed = new Set(['MUSIC_U', '__csrf']);
  const pairs = raw
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf('=');
      if (index < 1) return null;
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()] as const;
    })
    .filter((pair): pair is readonly [string, string] => Boolean(pair && allowed.has(pair[0]) && pair[1]));
  return pairs.length ? pairs.map(([key, value]) => `${key}=${value}`).join('; ') : null;
};

const profileFromStatus = (payload: unknown): NcmProfile | null => {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : root;
  const profile = data.profile && typeof data.profile === 'object' ? data.profile as Record<string, unknown> : null;
  const account = data.account && typeof data.account === 'object' ? data.account as Record<string, unknown> : null;
  const uid = Number(profile?.userId ?? account?.id ?? account?.userId);
  if (!Number.isFinite(uid) || uid <= 0) return null;
  return {
    uid,
    nickname: String(profile?.nickname ?? account?.userName ?? `网易云用户 ${uid}`),
    avatarUrl: typeof profile?.avatarUrl === 'string' ? profile.avatarUrl : undefined,
  };
};

const initial = readStoredSession();

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...initial,
  status: initial.cookie ? 'pending' : 'guest',

  setStatus: (status) => set({ status }),

  setSession: (cookie, profile = null) => {
    const safeCookie = sanitizeNcmCookie(cookie);
    if (!safeCookie) {
      get().clearSession();
      return;
    }
    const next = { cookie: safeCookie, profile };
    persist(next);
    set({ ...next, status: 'authed' });
  },

  setProfile: (profile) => {
    const cookie = get().cookie;
    persist({ cookie, profile });
    set({ profile });
  },

  clearSession: () => {
    persist({ cookie: null, profile: null });
    set({ cookie: null, profile: null, status: 'guest' });
  },

  restore: async () => {
    if (!get().cookie) {
      set({ status: 'guest' });
      return;
    }
    set({ status: 'pending' });
    try {
      const { ncm } = await import('../lib/ncm');
      const payload = await ncm('/login/status');
      const profile = profileFromStatus(payload);
      if (!profile) throw new Error('session invalid');
      persist({ cookie: get().cookie, profile });
      set({ profile, status: 'authed' });
    } catch {
      get().clearSession();
    }
  },

  logout: async () => {
    try {
      const { ncm } = await import('../lib/ncm');
      await ncm('/logout');
    } catch {
      // Clearing the local token is sufficient for local-first logout.
    } finally {
      get().clearSession();
    }
  },
}));

export { profileFromStatus };
