import { describe, expect, it } from 'vitest';
import { staffSessionRpcForRequest } from '../../src/lib/staff-session';

describe('staff request activity', () => {
  it('checks each real prefetch transport without renewing idle activity', () => {
    const transports: Record<string, string>[] = [
      { 'next-router-prefetch': '1' },
      { 'next-router-segment-prefetch': '/_tree' },
      { purpose: 'prefetch' },
      { 'sec-purpose': 'prefetch;prerender' },
    ];
    for (const values of transports) {
      expect(staffSessionRpcForRequest(new Headers(values))).toBe('staff_session_status');
    }
  });
  it('records real navigation and does not mistake unrelated header text for prefetch', () => {
    const transports: Record<string, string>[] = [
      {},
      { 'next-router-prefetch': '0' },
      { 'next-router-segment-prefetch': '' },
      { purpose: 'prefetcher' },
      { 'sec-purpose': 'navigate' },
      { 'x-purpose': 'prefetch' },
    ];
    for (const values of transports) {
      expect(staffSessionRpcForRequest(new Headers(values))).toBe('touch_staff_session');
    }
  });
  it('a forged prefetch flag still chooses the authenticated deadline RPC, never bypasses it', () => {
    expect(staffSessionRpcForRequest(new Headers({ 'next-router-prefetch': '1' }))).toBe(
      'staff_session_status',
    );
  });
});
