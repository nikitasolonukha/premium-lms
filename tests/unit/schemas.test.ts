import { describe, it, expect } from 'vitest';
import {
  blockSchema,
  courseSchema,
  settingsSchema,
  defaultSettings,
  passwordSchema,
} from '../../src/lib/schemas';
import { demoCourses } from '../../scripts/fixtures';
import { safeWebUrl } from '../../src/lib/video';
const id = '123e4567-e89b-42d3-a456-426614174000';
describe('untrusted content schemas', () => {
  it('accepts all eleven fixture blocks and complete courses', () => {
    const types = new Set();
    for (const course of demoCourses()) {
      expect(courseSchema.safeParse(course).success).toBe(true);
      for (const m of course.modules)
        for (const l of m.lessons)
          for (const b of l.blocks) {
            types.add(b.type);
            expect(blockSchema.safeParse(b).success).toBe(true);
          }
    }
    expect(types.size).toBe(11);
  });
  it('rejects HTML nodes, event attributes, script links and unknown fields', () => {
    for (const document of [
      { type: 'html', text: '<script>alert(1)</script>' },
      { type: 'paragraph', attrs: { onclick: 'evil()' } },
      {
        type: 'text',
        text: 'click',
        marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
      },
    ])
      expect(
        blockSchema.safeParse({ id, version: 1, type: 'rich_text', data: { document } }).success,
      ).toBe(false);
    expect(
      blockSchema.safeParse({ id, version: 1, type: 'divider', data: { html: 'x' } }).success,
    ).toBe(false);
  });
  it('rejects excessive nesting before recursive parsing', () => {
    let doc: unknown = { type: 'paragraph' };
    for (let i = 0; i < 15000; i++) doc = { type: 'blockquote', content: [doc] };
    expect(() =>
      blockSchema.safeParse({ id, version: 1, type: 'rich_text', data: { document: doc } }),
    ).not.toThrow();
    expect(
      blockSchema.safeParse({ id, version: 1, type: 'rich_text', data: { document: doc } }).success,
    ).toBe(false);
  });
  it('rejects duplicate stable identities and lesson slugs', () => {
    const doc = structuredClone(demoCourses()[0]);
    doc.modules[1].lessons[0].id = doc.modules[0].lessons[0].id;
    expect(courseSchema.safeParse(doc).success).toBe(false);
    const second = structuredClone(demoCourses()[0]);
    second.modules[1].lessons[0].slug = second.modules[0].lessons[0].slug;
    expect(courseSchema.safeParse(second).success).toBe(false);
  });
  it('normalizes embed origins and disallows fragments and paths', () => {
    expect(
      settingsSchema.parse({ ...defaultSettings, embed_origins: ['https://video.example.com/'] })
        .embed_origins,
    ).toEqual(['https://video.example.com']);
    for (const origin of [
      'https://video.example.com/path',
      'https://video.example.com/#x',
      'https://localhost.',
    ])
      expect(
        settingsSchema.safeParse({ ...defaultSettings, embed_origins: [origin] }).success,
      ).toBe(false);
  });
  it('rejects local domains with trailing dots and credentials', () => {
    for (const value of [
      'https://localhost.',
      'https://a.localhost./x',
      'https://printer.local./x',
      'https://2130706433/x',
      'https://[::1]/x',
      'https://user:secret@example.com',
    ])
      expect(safeWebUrl(value)).toBeNull();
  });
  it('requires long passwords with upper, lower and numeric characters', () => {
    expect(passwordSchema.safeParse('correcthorse123').success).toBe(false);
    expect(passwordSchema.safeParse('Strong-local-123').success).toBe(true);
  });
});
