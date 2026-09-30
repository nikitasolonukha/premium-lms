import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { accounts, login } from '../tests/e2e/helpers';
import { staffClient } from '../tests/e2e/db-fixtures';
import { courseSchema } from '../src/lib/schemas';

// db-fixtures enforces the isolated local Supabase URL. This check uses the
// pre-incident UAT course; it never resets, seeds or replaces existing content.
const prior = JSON.parse(readFileSync('docs/qa/evidence/uat.json', 'utf8'));
assert.equal(prior.status, 'PASS');
const health = await fetch('http://localhost:3000/api/health', {
  signal: AbortSignal.timeout(10_000),
});
assert.equal(health.status, 200);
const db = await staffClient();
const result = await db.rpc('course_document', { cid: prior.courseId, draft: false });
assert.equal(result.error, null);
const published = courseSchema.parse(result.data);
assert.equal(published.slug, prior.slug);
const lesson = published.modules[0].lessons[0];
assert.equal(lesson.blocks.length, 11);
const progress = await db
  .from('progress')
  .select('completed_at')
  .eq('user_id', accounts[2].id)
  .eq('lesson_id', lesson.id);
assert.equal(progress.error, null);
assert.equal(progress.data?.length, 1);
assert.ok(progress.data[0].completed_at);
const browser = await chromium.launch();
try {
  const admin = await browser.newPage({ baseURL: 'http://localhost:3000' });
  await login(admin, 0);
  await admin.goto(`/admin/courses/${prior.courseId}`);
  await expect(admin.getByLabel('Название курса', { exact: true })).toHaveValue(published.title);
  const student = await browser.newPage({ baseURL: 'http://localhost:3000' });
  await login(student, 2);
  const lessonPath = `/courses/${prior.slug}/lessons/${lesson.slug}`;
  await student.goto(lessonPath);
  await expect(student.locator('.lesson-content > *')).toHaveCount(11);
  await expect(student.getByRole('button', { name: 'Урок завершён', exact: true })).toBeDisabled();
  await expect(student.getByText('СЕКРЕТНЫЙ ЧЕРНОВИК РЕДАКТОРА UAT', { exact: true })).toHaveCount(
    0,
  );
  const image = student.locator('.lesson-figure img').first();
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  const imageUrl = await image.getAttribute('src');
  assert.ok(imageUrl);
  const imageResponse = await student.request.get(imageUrl);
  assert.equal(imageResponse.status(), 200);
  const imageBytes = (await imageResponse.body()).length;
  assert.ok(imageBytes > 0);
  const href = await student
    .getByRole('link', {
      name: 'План практики UAT Материал к уроку · скачать файл',
    })
    .getAttribute('href');
  assert.ok(href);
  const response = await student.request.get(href);
  assert.equal(response.status(), 200);
  const pdf = await response.body();
  assert.deepEqual(pdf, readFileSync('.local/uploads/План практики UAT.pdf'));
  const other = await browser.newPage({ baseURL: 'http://localhost:3000' });
  await login(other, 3);
  await other.goto(lessonPath);
  await expect(other.getByRole('heading', { name: 'Страница недоступна' })).toBeVisible();
  assert.equal((await other.request.get(href, { maxRedirects: 0 })).status(), 404);
  writeFileSync(
    'docs/qa/evidence/runtime-recovery.json',
    JSON.stringify(
      {
        status: 'PASS',
        executedAt: new Date().toISOString(),
        courseId: prior.courseId,
        publishedBlocks: lesson.blocks.length,
        completedProgressRows: progress.data.length,
        imageBytes,
        pdfBytes: pdf.length,
        pdfSha256: createHash('sha256').update(pdf).digest('hex'),
        checks: [
          'existing pre-incident UAT course, publication and completed progress retained',
          'Admin UI login with MFA and existing course editor',
          'Student A renders published blocks and decoded private image',
          'existing private PDF download equals original bytes',
          'Editor draft remains hidden',
          'Student B cannot read the lesson or reuse the download grant',
          'no database reset or seed used for recovery',
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: existing UAT course, progress, MFA, private image/PDF and A/B isolation after recovery',
  );
} finally {
  await browser.close();
  await db.auth.signOut();
}
