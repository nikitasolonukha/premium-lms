/** Player.js 0.0.11 transport (https://github.com/embedly/player.js/blob/master/SPEC.rst).
 * Bind both origin and window identity; other embeds on the same host are untrusted.
 */
export function readPlayerMessage(event: { origin: string; source: unknown; data: unknown }, frame: unknown, origin: string): { event: string; value?: unknown } | null {
  if (!frame || event.source !== frame || event.origin !== origin || typeof event.data !== 'string' || event.data.length > 8192) return null;
  try {
    const data = JSON.parse(event.data);
    if (!data || data.context !== 'player.js' || !['ready', 'timeupdate', 'play', 'pause', 'ended', 'error'].includes(data.event)) return null;
    return { event: data.event, value: data.value };
  } catch { return null; }
}
export function playbackRenewalDelay(expiresAt: string, now = Date.now()) {
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires)) throw new Error('INVALID_EXPIRY');
  return Math.max(0, expires - now - 30000);
}
