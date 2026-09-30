export type Role = 'student' | 'editor' | 'admin';
export type Capability = 'content' | 'publish' | 'users' | 'settings' | 'audit' | 'categories';
export function canManage(role: Role, capability: Capability): boolean {
  return role === 'admin' || (role === 'editor' && capability === 'content');
}
const alphabet: Record<string, string> = Object.fromEntries(
  'а:a б:b в:v г:g д:d е:e ё:e ж:zh з:z и:i й:i к:k л:l м:m н:n о:o п:p р:r с:s т:t у:u ф:f х:kh ц:ts ч:ch ш:sh щ:shch ъ: ы:y ь: э:e ю:yu я:ya'
    .split(' ')
    .map((x) => x.split(':')),
);
export function slugify(value: string): string {
  return (
    [...value.toLowerCase()]
      .map((x) => alphabet[x] ?? x)
      .join('')
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80)
      .replace(/-$/, '') || 'course'
  );
}
export function safeNext(value?: string | null): string {
  if (!value || value.length > 1000) return '/dashboard';
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return '/dashboard';
  }
  if (
    !decoded.startsWith('/') ||
    decoded.startsWith('//') ||
    /[\\\x00-\x20]/.test(decoded) ||
    /^\/(login|register|auth|reset-password|forgot-password)(\/|\?|$)/.test(decoded)
  )
    return '/dashboard';
  return value;
}
export function progressPercent(lessonIds: string[], completed: string[]): number {
  const ids = [...new Set(lessonIds)],
    done = new Set(completed);
  return ids.length ? Math.floor((ids.filter((id) => done.has(id)).length / ids.length) * 100) : 0;
}
export function nextLesson(
  lessonIds: string[],
  completed: string[],
  last?: string | null,
): string | null {
  const done = new Set(completed);
  if (last && lessonIds.includes(last) && !done.has(last)) return last;
  return lessonIds.find((id) => !done.has(id)) ?? null;
}
export function completionState(
  id: string,
  lessonIds: string[],
  completed: string[],
  sequential: boolean,
): 'locked' | 'completed' | 'available' {
  const index = lessonIds.indexOf(id),
    done = new Set(completed);
  if (index < 0) return 'locked';
  if (done.has(id)) return 'completed';
  return sequential && lessonIds.slice(0, index).some((prior) => !done.has(prior))
    ? 'locked'
    : 'available';
}
