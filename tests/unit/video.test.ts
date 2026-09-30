import { describe, it, expect } from 'vitest';
import { resolveVideo, safeWebUrl } from '../../src/lib/video';
describe('video adapters', () => {
  it('normalizes YouTube without trusting arbitrary domains', () => {
    expect(resolveVideo('youtube', 'https://youtu.be/aqz-KE-bpKQ').url).toBe(
      'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
    );
    expect(() =>
      resolveVideo('youtube', 'https://youtube.com.evil.test/watch?v=aqz-KE-bpKQ'),
    ).toThrow();
  });
  it('normalizes Vimeo and Rutube', () => {
    expect(resolveVideo('vimeo', 'https://vimeo.com/76979871').url).toBe(
      'https://player.vimeo.com/video/76979871',
    );
    expect(
      resolveVideo('rutube', 'https://rutube.ru/video/0123456789abcdef0123456789abcdef/').url,
    ).toBe('https://rutube.ru/play/embed/0123456789abcdef0123456789abcdef');
  });
  it('requires approved embed origins and supported direct URLs', () => {
    expect(() => resolveVideo('external', 'https://evil.test/embed')).toThrow();
    expect(
      resolveVideo('external', 'https://video.example.com/embed/abc', ['https://video.example.com'])
        .kind,
    ).toBe('iframe');
    expect(resolveVideo('direct', 'https://cdn.example.com/video.mp4').kind).toBe('video');
    expect(() => resolveVideo('direct', 'https://cdn.example.com/file.html')).toThrow();
    expect(() => resolveVideo('mux', 'abc')).toThrow();
  });
  it('preserves provider access parameters without forwarding arbitrary query options', () => {
    expect(
      resolveVideo('vimeo', 'https://player.vimeo.com/video/76979871?h=8272103f6e&autoplay=1').url,
    ).toBe('https://player.vimeo.com/video/76979871?h=8272103f6e');
    expect(
      resolveVideo(
        'rutube',
        'https://rutube.ru/play/embed/caafe83ff1c6ed38d394635b83ece578/?p=IBgzQQrKH4qB1bqm_91x7Q',
      ).url,
    ).toBe(
      'https://rutube.ru/play/embed/caafe83ff1c6ed38d394635b83ece578?p=IBgzQQrKH4qB1bqm_91x7Q',
    );
    expect(() =>
      resolveVideo('vimeo', 'https://vimeo.com/76979871?h=first123&h=second123'),
    ).toThrow();
    expect(() => resolveVideo('vimeo', 'https://vimeo.com/76979871?h=%3Cscript%3E')).toThrow();
  });
  it('rejects script, credentials, localhost and non-web URLs', () => {
    for (const u of [
      'javascript:alert(1)',
      'data:text/html,hello',
      'http://127.0.0.1/a',
      'https://user:pass@example.com',
      'ftp://example.com/a',
    ])
      expect(safeWebUrl(u)).toBeNull();
    expect(safeWebUrl('https://example.com/test')).toBe('https://example.com/test');
  });
});
