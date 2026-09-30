import { describe, it, expect } from 'vitest';
import {
  slugify,
  safeNext,
  progressPercent,
  nextLesson,
  canManage,
  completionState,
} from '../../src/lib/domain';
describe('stable course URLs', () => {
  it('transliterates Cyrillic, collapses punctuation and bounds length', () => {
    expect(slugify('ИИ: От идеи — к продукту!')).toBe('ii-ot-idei-k-produktu');
    expect(slugify('')).toBe('course');
    expect(slugify('a'.repeat(300)).length).toBe(80);
  });
  it('accepts only safe local redirects', () => {
    expect(safeNext('/courses/ai?q=1')).toBe('/courses/ai?q=1');
    for (const url of [
      'https://evil.test',
      '//evil.test',
      '/\\evil.test',
      '/%5cevil.test',
      '/login',
      'javascript:alert(1)',
      undefined,
    ])
      expect(safeNext(url)).toBe('/dashboard');
  });
});
describe('learning progress', () => {
  it('never reports full completion while a published lesson remains unfinished', () => {
    const lessons = Array.from({ length: 300 }, (_, i) => String(i));
    expect(progressPercent(lessons, lessons.slice(0, 299))).toBe(99);
    expect(progressPercent(lessons, lessons)).toBe(100);
  });
  it('handles zero lessons, duplicate completions, new and removed lessons', () => {
    expect(progressPercent([], [])).toBe(0);
    expect(progressPercent(['a', 'b', 'c'], ['a', 'a', 'removed'])).toBe(33);
    expect(progressPercent(['a'], ['a', 'b'])).toBe(100);
  });
  it('continues the last unfinished lesson or the next unfinished', () => {
    expect(nextLesson(['a', 'b', 'c'], ['a'], 'b')).toBe('b');
    expect(nextLesson(['a', 'b', 'c'], ['a', 'b'], 'b')).toBe('c');
    expect(nextLesson(['a'], ['a'], 'a')).toBeNull();
    expect(nextLesson(['a', 'b'], [], 'deleted')).toBe('a');
  });
  it('enforces sequential prerequisites', () => {
    expect(completionState('b', ['a', 'b'], [], true)).toBe('locked');
    expect(completionState('b', ['a', 'b'], ['a'], true)).toBe('available');
    expect(completionState('a', ['a', 'b'], ['a'], true)).toBe('completed');
    expect(completionState('x', ['a'], [], false)).toBe('locked');
  });
});
describe('role capabilities', () => {
  it('never lets an editor publish or manage users', () => {
    expect(canManage('editor', 'content')).toBe(true);
    expect(canManage('editor', 'publish')).toBe(false);
    expect(canManage('editor', 'users')).toBe(false);
    expect(canManage('student', 'content')).toBe(false);
    expect(canManage('admin', 'settings')).toBe(true);
  });
});
