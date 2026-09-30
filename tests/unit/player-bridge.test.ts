import { expect, it } from 'vitest';
import { readPlayerMessage, playbackRenewalDelay } from '../../src/lib/player-bridge';
it('accepts Player.js events only from the exact iframe and origin', () => {
  const frame = {}, otherFrame = {};
  const data = JSON.stringify({ context: 'player.js', event: 'timeupdate', value: { seconds: 45 } });
  expect(readPlayerMessage({ origin: 'https://player.mux.com', source: frame, data }, frame, 'https://player.mux.com')?.event).toBe('timeupdate');
  expect(readPlayerMessage({ origin: 'https://evil.example.com', source: frame, data }, frame, 'https://player.mux.com')).toBeNull();
  expect(readPlayerMessage({ origin: 'https://player.mux.com', source: otherFrame, data }, frame, 'https://player.mux.com')).toBeNull();
});
it('rejects malformed and oversized player messages', () => {
  const frame = {};
  for (const data of ['{', 'a'.repeat(20000), JSON.stringify({ context: 'other', event: 'play' }), JSON.stringify({ context: 'player.js', event: '__proto__' })])
    expect(readPlayerMessage({ origin: 'https://player.mux.com', source: frame, data }, frame, 'https://player.mux.com')).toBeNull();
});
it('renews thirty seconds before expiry and rejects invalid expiry', () => {
  expect(playbackRenewalDelay(new Date(200000).toISOString(), 20000)).toBe(150000);
  expect(playbackRenewalDelay(new Date(200000).toISOString(), 210000)).toBe(0);
  expect(() => playbackRenewalDelay('bad', 100)).toThrow('INVALID_EXPIRY');
});
