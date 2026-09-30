import { describe, expect, it } from 'vitest';
import { staffSessionRpcForRequest, staffPrefetchHeaderValue } from '../../src/lib/staff-session';

describe('staff request activity', () => {
  it('preserves prefetch after Next hides its internal transport headers from headers()', () => {
    expect(staffSessionRpcForRequest(new Headers({ 'x-lms-background-prefetch': '1' }))).toBe(
      'staff_session_status',
    );
    expect(staffSessionRpcForRequest(new Headers({ 'x-lms-background-prefetch': '0' }))).toBe(
      'touch_staff_session',
    );
  });
  it('derives the proxy marker from transport headers and ignores a forged incoming marker', () => {
    expect(staffPrefetchHeaderValue(new Headers({ 'x-lms-background-prefetch': '1' }))).toBe('0');
    expect(
      staffPrefetchHeaderValue(
        new Headers({ 'x-lms-background-prefetch': '0', 'next-router-prefetch': '1' }),
      ),
    ).toBe('1');
  });
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
  it('normalizes purpose tokens without treating arbitrary substrings as browser activity hints', () => {
    expect(
      staffSessionRpcForRequest(new Headers({ 'Sec-Purpose': ' Prefetch ; prerender ' })),
    ).toBe('staff_session_status');
    expect(staffSessionRpcForRequest(new Headers({ Purpose: 'PREFETCHER; navigate' }))).toBe(
      'touch_staff_session',
    );
  });
});
