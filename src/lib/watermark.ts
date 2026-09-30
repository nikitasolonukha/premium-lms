export type WatermarkMode = 'email' | 'user_id' | 'email_and_id';

/** Mask before crossing the server/client boundary; the overlay needs no full email. */
export function watermarkLabel(actor: { email: string; id: string }, mode: WatermarkMode) {
  const shortId = actor.id.slice(0, 8);
  const [local, domain] = actor.email.split('@');
  if (!local || !domain || mode === 'user_id') return shortId;
  const suffix = domain.includes('.') ? domain.slice(domain.lastIndexOf('.')) : '';
  const masked = `${local[0]}***@${domain[0]}***${suffix}`;
  return mode === 'email' ? masked : `${masked} · ${shortId}`;
}
