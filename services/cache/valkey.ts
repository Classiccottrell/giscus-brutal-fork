import { GlideClient } from '@valkey/valkey-glide';
import { InstallationAccessToken } from '../../lib/types/cache';
import { env } from '../../lib/variables';

const VALKEY_PREFIX = env.valkey_prefix || 'giscus:installation_access_tokens:';

let _client: GlideClient | null = null;
let _clientPromise: Promise<GlideClient> | null = null;

async function getClient() {
  if (_client) return _client;

  if (!_clientPromise) {
    const url = new URL(env.valkey_url!);
    _clientPromise = GlideClient.createClient({
      addresses: [{ host: url.hostname, port: Number(url.port) }],
      useTLS: url.protocol === 'valkeys:' || url.protocol === 'rediss:',
      clientName: 'giscus',
      ...(url.password && {
        credentials: {
          ...(url.username && { username: url.username }),
          password: url.password,
        },
      }),
    })
      .then((client) => {
        _client = client;
        return client;
      })
      .catch(() => {
        _clientPromise = null;
        throw new Error('Unable to connect to Valkey server.');
      });
  }

  return _clientPromise;
}

export async function getCachedAccessToken(installationId: number) {
  if (!env.valkey_url) return null;

  const client = await getClient();
  let fields: Awaited<ReturnType<(typeof client)['hgetall']>>;
  try {
    fields = await client.hgetall(`${VALKEY_PREFIX}${installationId}`);
  } catch {
    throw new Error('Unable to fetch token from Valkey.');
  }
  if (!fields.length) return null;
  return Object.fromEntries(
    fields.map(({ field, value }) => [field, value]),
  ) as InstallationAccessToken;
}

export async function setCachedAccessToken({
  installation_id,
  token,
  expires_at,
  created_at,
}: InstallationAccessToken) {
  if (!env.valkey_url) return false;

  const client = await getClient();
  const body: Omit<InstallationAccessToken, 'installation_id'> = {
    token,
    expires_at,
    updated_at: new Date().toISOString(),
  };
  if (created_at) body.created_at = created_at;
  try {
    await client.hset(`${VALKEY_PREFIX}${installation_id}`, body);
  } catch {
    throw new Error('Unable to save token to Valkey.');
  }

  return true;
}
