import { InstallationAccessToken } from '../../lib/types/cache';
import { env } from '../../lib/variables';
import { sign } from 'jsonwebtoken';

function getJWT() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    role: env.postgrest_role,
    // JWT expiration time (10 minute maximum)
    exp: now + 10 * 60,
  };
  return sign(payload, env.postgrest_secret);
}

export async function getCachedAccessToken(installationId: number) {
  if (!env.postgrest_url || !env.postgrest_secret) return null;

  const params = new URLSearchParams({
    select: '*',
    installation_id: `eq.${installationId}`,
  });
  const url = `${env.postgrest_url}?${params}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getJWT()}`,
      Accept: 'application/vnd.pgrst.object+json',
      Range: '0',
    },
  });

  if (!response.ok) return null;

  return (await response.json()) as InstallationAccessToken;
}

export async function setCachedAccessToken({
  installation_id,
  token,
  created_at,
  expires_at,
}: InstallationAccessToken) {
  if (!env.postgrest_url || !env.postgrest_secret) return false;

  const params = new URLSearchParams({
    installation_id: `eq.${installation_id}`,
  });
  const url = `${env.postgrest_url}?${params}`;

  const body: InstallationAccessToken = {
    installation_id,
    token,
    expires_at,
    updated_at: new Date().toISOString(),
  };
  if (created_at) body.created_at = created_at;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${getJWT()}`,
      Accept: 'application/vnd.pgrst.object+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return response.ok;
}
