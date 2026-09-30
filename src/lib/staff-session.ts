import { z } from 'zod';
export const staffSessionSchema = z.object({
  serverTime: z.iso.datetime({ offset: true }),
  idleExpiresAt: z.iso.datetime({ offset: true }),
  absoluteExpiresAt: z.iso.datetime({ offset: true }),
});
export type StaffSession = z.infer<typeof staffSessionSchema>;
export const STAFF_PREFETCH_HEADER = 'x-lms-background-prefetch';

export function staffPrefetchHeaderValue(headers: Pick<Headers, 'get'>): '1' | '0' {
  const prefetch =
    headers.get('next-router-prefetch') === '1' ||
    Boolean(headers.get('next-router-segment-prefetch')) ||
    ['purpose', 'sec-purpose'].some((name) =>
      (headers.get(name) ?? '')
        .toLowerCase()
        .split(/[;,\s]+/)
        .includes('prefetch'),
    );
  return prefetch ? '1' : '0';
}

export function staffSessionRpcForRequest(
  headers: Pick<Headers, 'get'>,
): 'staff_session_status' | 'touch_staff_session' {
  // Proxy preserves Next's transport hint before headers() hides FLIGHT_HEADERS.
  // Both RPCs independently enforce live session, MFA, role and deadlines.
  return headers.get(STAFF_PREFETCH_HEADER) === '1' || staffPrefetchHeaderValue(headers) === '1'
    ? 'staff_session_status'
    : 'touch_staff_session';
}
