import { createClient } from '@supabase/supabase-js';
import { TOTP, Secret } from 'otpauth';
import { randomUUID } from 'node:crypto';
import { accounts } from './helpers';
import { demoCourses } from '../../scripts/fixtures';
import { courseSchema, type CourseDraft } from '../../src/lib/schemas';
process.loadEnvFile('.env.local');
if (process.env.SUPABASE_URL !== 'http://127.0.0.1:56321')
  throw new Error('QA fixtures are local-only');
export async function staffClient() {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const account = accounts[0];
  if (
    (await db.auth.signInWithPassword({ email: account.email, password: account.password })).error
  )
    throw new Error('Local QA login failed');
  if (
    (
      await db.auth.mfa.challengeAndVerify({
        factorId: account.factorId,
        code: new TOTP({ secret: Secret.fromBase32(account.totpSecret) }).generate(),
      })
    ).error
  )
    throw new Error('Local QA MFA failed');
  if ((await db.rpc('touch_staff_session')).error) throw new Error('Local QA session failed');
  return db;
}
export async function document(db: Awaited<ReturnType<typeof staffClient>>, id: string) {
  const result = await db.rpc('course_document', { cid: id, draft: true });
  if (result.error) throw new Error('Could not read QA course');
  return courseSchema.parse(result.data);
}
export async function fixtureCourse(db: Awaited<ReturnType<typeof staffClient>>, large = false) {
  const seed = demoCourses()[0],
    id = randomUUID();
  const doc: CourseDraft = {
    ...seed,
    id,
    version: 0,
    slug: `qa-${id}`,
    title: `QA ${id.slice(0, 8)} — «Исследование» 🧭 <b>текст</b>`,
    featured: false,
    accessMode: 'restricted',
    sequential: false,
    tags: ['QA', 'Исследование'],
    modules: Array.from({ length: large ? 21 : 2 }, (_, i) => ({
      id: randomUUID(),
      title: `Модуль ${i + 1}: ясные решения`,
      lessons: Array.from({ length: large ? 3 : 2 }, (_, j) => ({
        ...seed.modules[0].lessons[0],
        id: randomUUID(),
        slug: `lesson-${i}-${j}`,
        title: `Урок ${i + 1}.${j + 1}: вопрос, гипотеза и проверка`,
        blocks: seed.modules[0].lessons[0].blocks
          .filter((b) => (large ? b.type === 'rich_text' : true))
          .map((b) => ({ ...structuredClone(b), id: randomUUID() })),
      })),
    })),
  };
  if (large) {
    doc.title = 'Длинная программа — осмысленное исследование с практикой и рефлексией. '
      .repeat(3)
      .slice(0, 180);
    doc.summary = 'Описание с кириллицей, Latin, emoji 🧭 и <script>обычным текстом</script>. '
      .repeat(5)
      .slice(0, 400);
    doc.description = 'Подробное описание.\n'.repeat(400);
    doc.tags = Array.from({ length: 12 }, (_, i) => `Тег ${i + 1}`);
  }
  const saved = await db.rpc('save_course', { doc, expected_version: 0 });
  if (saved.error || saved.data?.error)
    throw new Error(`QA fixture failed: ${saved.error?.message ?? saved.data?.error}`);
  return document(db, id);
}
