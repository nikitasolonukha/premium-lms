import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function requestId(value: string | null | undefined) {
  return value && uuid.test(value) ? value.toLowerCase() : randomUUID();
}

export function trustedClientIp(
  headers: Pick<Headers, 'get'>,
  config: { TRUSTED_IP_HEADER?: string; TRUSTED_PROXY_ACKNOWLEDGED?: boolean },
) {
  if (!config.TRUSTED_IP_HEADER) return null;
  if (!config.TRUSTED_PROXY_ACKNOWLEDGED) throw new Error('Trusted proxy acknowledgement required');
  const value = headers.get(config.TRUSTED_IP_HEADER)?.trim() ?? '';
  const version = isIP(value);
  if (!version || value.includes('%')) throw new Error('Trusted proxy must supply one valid IP address');
  return version === 6 ? new URL(`http://[${value}]`).hostname.slice(1, -1) : value;
}
