import { expect, it } from 'vitest';
import { watermarkLabel } from '../../src/lib/watermark';
import { settingsSchema, defaultSettings, blockSchema } from '../../src/lib/schemas';
it('minimizes viewer identity for all configured watermark modes', () => {
  const actor = { email: 'alexander@academy.example', id: '483a19ca-3159-40e7-9aa8-72c32eb8f3be' };
  expect(watermarkLabel(actor, 'email')).toBe('a***@a***.example');
  expect(watermarkLabel(actor, 'user_id')).toBe('483a19ca');
  expect(watermarkLabel(actor, 'email_and_id')).toBe('a***@a***.example · 483a19ca');
  expect(watermarkLabel({ ...actor, email: '' }, 'email')).toBe('483a19ca');
});
it('bounds watermark interval and opacity and remains disabled by default', () => {
  expect(defaultSettings.content_watermark_enabled).toBe(false);
  expect(settingsSchema.safeParse({ ...defaultSettings, watermark_interval_seconds: 0 }).success).toBe(false);
  expect(settingsSchema.safeParse({ ...defaultSettings, watermark_opacity: 1 }).success).toBe(false);
  expect(settingsSchema.safeParse({ ...defaultSettings, watermark_mode: 'email_and_id', watermark_interval_seconds: 12, watermark_opacity: 0.3 }).success).toBe(true);
});
it('stores protected source IDs, rejects permanent URLs and leaves public URL blocks valid', () => {
  const block = { id: '483a19ca-3159-40e7-9aa8-72c32eb8f3be', version: 1, type: 'video' };
  expect(blockSchema.safeParse({ ...block, data: { provider: 'cloudflare', sourceId: 'a'.repeat(32), title: 'Private' } }).success).toBe(true);
  expect(blockSchema.safeParse({ ...block, data: { provider: 'mux', sourceId: 'SignedPlayback123456', title: 'Private' } }).success).toBe(true);
  expect(blockSchema.safeParse({ ...block, data: { provider: 'cloudflare', url: 'https://example.com/private', title: 'Private' } }).success).toBe(false);
  expect(blockSchema.safeParse({ ...block, data: { provider: 'youtube', url: 'https://youtube.com/watch?v=aqz-KE-bpKQ', title: 'Public' } }).success).toBe(true);
});
