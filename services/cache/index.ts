import { InstallationAccessToken } from '../../lib/types/cache';
import { env } from '../../lib/variables';
import {
  getCachedAccessToken as postgrestGet,
  setCachedAccessToken as postgrestSet,
} from './postgrest';
import {
  getCachedAccessToken as supabaseGet,
  setCachedAccessToken as supabaseSet,
} from './supabase';
import { getCachedAccessToken as valkeyGet, setCachedAccessToken as valkeySet } from './valkey';

interface TokenCacheClient {
  get(installationId: number): Promise<InstallationAccessToken | null>;
  set(token: InstallationAccessToken): Promise<boolean>;
}

const INTOLERANCE_TIMEOUT = 1000 * 60 * 5; // 5 minutes

function getTokenCacheClient(): TokenCacheClient {
  let get: (installationId: number) => Promise<InstallationAccessToken | null>;
  let set: (token: InstallationAccessToken) => Promise<boolean>;
  if (env.valkey_url) {
    get = valkeyGet;
    set = valkeySet;
  } else if (env.postgrest_url && env.postgrest_role && env.postgrest_secret) {
    get = postgrestGet;
    set = postgrestSet;
  } else {
    get = supabaseGet;
    set = supabaseSet;
  }

  return {
    get: async (installationId: number) => {
      const record = await get(installationId);
      if (!record) return null;
      const expiresAt = new Date(record.expires_at).getTime();
      const now = new Date().getTime();
      if (expiresAt - now < INTOLERANCE_TIMEOUT) return { ...record, token: '' };
      return record;
    },
    set,
  };
}

export const TokenCache = getTokenCacheClient();
