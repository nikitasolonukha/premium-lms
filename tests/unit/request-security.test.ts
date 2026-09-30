import { expect, it } from 'vitest';
import { requestId, trustedClientIp } from '../../src/lib/request-security';
it('accepts only a UUID correlation ID and generates one for untrusted input', () => {
  const id = '483a19ca-3159-40e7-9aa8-72c32eb8f3be';
  expect(requestId(id)).toBe(id);
  for (const value of [null, '', 'secret@example.com', 'bad\r\nvalue', 'x'.repeat(10000)])
    expect(requestId(value)).toMatch(/^[a-f0-9-]{36}$/);
  expect(requestId(null)).not.toBe(requestId(null));
});
it('ignores spoofed IP headers unless explicitly configured and acknowledged', () => {
  const headers = new Headers({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' });
  expect(trustedClientIp(headers, {})).toBeNull();
  expect(() => trustedClientIp(headers, { TRUSTED_IP_HEADER: 'x-real-ip' })).toThrow();
  expect(trustedClientIp(headers, { TRUSTED_IP_HEADER: 'x-real-ip', TRUSTED_PROXY_ACKNOWLEDGED: true })).toBe('5.6.7.8');
  for (const value of ['1.2.3.4, 5.6.7.8', 'unknown', '1.2.3.4:1234', ''])
    expect(() => trustedClientIp(new Headers({ 'x-real-ip': value }), { TRUSTED_IP_HEADER: 'x-real-ip', TRUSTED_PROXY_ACKNOWLEDGED: true })).toThrow();
});
it('canonicalizes equivalent IPv6 representations to one rate-limit key', () => {
  const config = { TRUSTED_IP_HEADER: 'x-real-ip', TRUSTED_PROXY_ACKNOWLEDGED: true };
  expect(trustedClientIp(new Headers({ 'x-real-ip': '2001:db8:0:0:0:0:0:1' }), config)).toBe('2001:db8::1');
});
