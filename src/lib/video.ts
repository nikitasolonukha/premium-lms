export type VideoProvider =
  'youtube' | 'vimeo' | 'rutube' | 'direct' | 'external' | 'mux' | 'cloudflare' | 'upload';
export type PlaybackGrant = {
  kind: 'iframe' | 'video';
  url: string;
  protected: boolean;
  expiresAt?: string;
  provider: VideoProvider;
  downloadUrl?: string;
};
export interface VideoProviderAdapter {
  provider: VideoProvider;
  capabilities: { signedPlayback: boolean; nativeFullscreen: boolean };
  resolve(source: string, allowedOrigins?: string[]): PlaybackGrant;
}
export interface ProtectedVideoProviderAdapter {
  provider: 'mux' | 'cloudflare';
  capabilities: { signedPlayback: true; nativeFullscreen: boolean };
  validateSource(source: string): boolean;
  /** Called only by a server route after live-session, publication and lesson-access checks. */
  issueGrant(
    source: string,
    viewer: { userId: string; courseId: string; lessonId: string; ttlSeconds: number },
  ): Promise<PlaybackGrant & { protected: true; expiresAt: string }>;
}
export function safeWebUrl(input: string): string | null {
  try {
    const u = new URL(input);
    const h = u.hostname.toLowerCase().replace(/\.+$/, '');
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      h === 'localhost' ||
      h.endsWith('.localhost') ||
      h.endsWith('.local') ||
      h.includes(':') ||
      /^(\d{1,3}\.){3}\d{1,3}$/.test(h)
    )
      return null;
    return u.toString();
  } catch {
    return null;
  }
}
export function resolveVideo(
  provider: VideoProvider,
  source: string,
  allowedOrigins: string[] = [],
): PlaybackGrant {
  if (provider === 'mux' || provider === 'cloudflare' || provider === 'upload')
    throw new Error('Защищённое видео требует серверного разрешения на воспроизведение');
  const safe = safeWebUrl(source);
  if (!safe) throw new Error('Укажите безопасный HTTPS-адрес видео');
  const u = new URL(safe),
    h = u.hostname.replace(/^www\./, '');
  let url: string | undefined;
  if (provider === 'youtube' && ['youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(h)) {
    const id =
      h === 'youtu.be'
        ? u.pathname.slice(1)
        : (u.searchParams.get('v') ?? u.pathname.split('/').at(-1));
    if (id && /^[\w-]{11}$/.test(id)) url = `https://www.youtube-nocookie.com/embed/${id}`;
  }
  if (provider === 'vimeo' && ['vimeo.com', 'player.vimeo.com'].includes(h)) {
    const id = u.pathname.split('/').filter(Boolean).at(-1);
    if (id && /^\d{5,12}$/.test(id)) url = `https://player.vimeo.com/video/${id}`;
  }
  if (provider === 'rutube' && h === 'rutube.ru') {
    const id = u.pathname.split('/').filter(Boolean).at(-1);
    if (id && /^[a-f0-9]{32}$/.test(id)) url = `https://rutube.ru/play/embed/${id}`;
  }
  if (provider === 'direct' && /\.(mp4|webm|ogg)$/i.test(u.pathname)) url = safe;
  if (provider === 'external' && allowedOrigins.includes(u.origin)) url = safe;
  if (!url) throw new Error('Адрес не соответствует выбранному провайдеру');
  // Unlisted embeds need the provider's access hash; never forward arbitrary player options.
  const accessKey = provider === 'vimeo' ? 'h' : provider === 'rutube' ? 'p' : null;
  if (accessKey) {
    const values = u.searchParams.getAll(accessKey);
    if (values.length > 1 || (values.length === 1 && !/^[A-Za-z0-9_-]{6,128}$/.test(values[0])))
      throw new Error('Некорректный параметр доступа к видео');
    if (values.length) url += `?${accessKey}=${encodeURIComponent(values[0])}`;
  }
  return { provider, kind: provider === 'direct' ? 'video' : 'iframe', url, protected: false };
}
export const videoProviders: { value: VideoProvider; label: string }[] = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'vimeo', label: 'Vimeo' },
  { value: 'rutube', label: 'Rutube' },
  { value: 'direct', label: 'Прямой URL видео' },
  { value: 'external', label: 'Разрешённый embed' },
];
