import { createClient } from '@supabase/supabase-js';
import { TOTP, Secret } from 'otpauth';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { qaPath } from './qa-paths.mjs';
import type { CourseDraft } from '../src/lib/schemas';

const url = process.env.SUPABASE_URL!;
if (!/^http:\/\/(127\.0\.0\.1|localhost):56321$/.test(url)) throw new Error('Local QA only');
const accounts = JSON.parse(readFileSync('.local/seed-accounts.json', 'utf8'));
const fresh = () => createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
async function login(index: number, mfa = false) {
  const client = fresh(), account = accounts[index];
  assert.equal((await client.auth.signInWithPassword({ email: account.email, password: account.password })).error, null);
  if (mfa) {
    assert.equal((await client.auth.mfa.challengeAndVerify({ factorId: account.factorId, code: new TOTP({ secret: Secret.fromBase32(account.totpSecret) }).generate() })).error, null);
    assert.equal((await client.rpc('touch_staff_session')).error, null);
  }
  return client;
}
const [admin, editor, a, b, noMfa] = await Promise.all([login(0, true), login(1, true), login(2), login(3), login(0)]);
const id = randomUUID(), lid = randomUUID(), bid = randomUUID(), second = randomUUID(), secondBlock = randomUUID(), draft = randomUUID(), draftBlock = randomUUID();
const doc: CourseDraft = { id, version: 0, slug: `qa-protected-${id.slice(0, 8)}`, title: 'Protected playback boundary QA', description: '', summary: '', author: 'QA', categoryId: null, tags: [], coverId: null, accent: 'blue', featured: false, accessMode: 'restricted', sequential: true, modules: [{ id: randomUUID(), title: 'Module', lessons: [
  { id: lid, slug: 'first', title: 'First', duration: 1, published: true, blocks: [{ id: bid, version: 1, type: 'video', data: { provider: 'cloudflare', sourceId: 'a'.repeat(32), title: 'Private fixture, no live provider' } }] },
  { id: second, slug: 'second', title: 'Second', duration: 1, published: true, blocks: [{ id: secondBlock, version: 1, type: 'video', data: { provider: 'mux', sourceId: 'SignedFixture123456', title: 'Private fixture, no live provider' } }] },
  { id: draft, slug: 'draft', title: 'Draft', duration: 1, published: false, blocks: [{ id: draftBlock, version: 1, type: 'video', data: { provider: 'cloudflare', sourceId: 'b'.repeat(32), title: 'Draft only' } }] },
] }] };
const results: { name: string; status: 'PASS' | 'FAIL' }[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); }
  catch { results.push({ name, status: 'FAIL' }); console.error(`FAIL ${name}`); }
}
const context = (client: ReturnType<typeof fresh>, lesson = lid, block = bid, preview = false) => client.rpc('playback_context', { lid: lesson, bid: block, draft: preview });
try {
  // Deliberately tests the actual RPC surface, including direct requests outside the app.
  await check('protected source schema accepted through authenticated RPC', async () => {
    const saved = await admin.rpc('save_course', { doc, expected_version: 0 });
    assert.equal(saved.error, null); assert.ok(saved.data?.version);
    doc.version = saved.data.version;
    assert.equal((await admin.rpc('publish_course', { cid: id, expected_version: doc.version })).error, null);
    assert.equal((await admin.rpc('set_access', { target_user: accounts[2].id, cid: id, enabled: true })).error, null);
  });
  await check('Student A gets published source; B and anonymous denied', async () => {
    const allowed = await context(a); assert.equal(allowed.error, null); assert.equal(allowed.data?.block?.data?.sourceId, 'a'.repeat(32));
    assert.ok((await context(b)).error); assert.ok((await context(fresh())).error);
  });
  await check('draft and sequentially locked sources cannot be extracted', async () => {
    assert.ok((await context(a, second, secondBlock)).error);
    assert.ok((await context(a, draft, draftBlock)).error);
    assert.ok((await context(a, lid, bid, true)).error);
    assert.ok((await context(noMfa, lid, bid, true)).error);
    assert.equal((await context(editor, draft, draftBlock, true)).error, null);
  });
  await check('Editor changes stay in draft until Admin publishes', async () => {
    const current = await editor.rpc('course_document', { cid: id, draft: true }); assert.equal(current.error, null);
    const changed = current.data; changed.modules[0].lessons[0].blocks[0].data.sourceId = 'c'.repeat(32);
    const saved = await editor.rpc('save_course', { doc: changed, expected_version: changed.version }); assert.equal(saved.error, null);
    assert.equal((await context(a)).data?.block?.data?.sourceId, 'a'.repeat(32));
    assert.equal((await context(editor, lid, bid, true)).data?.block?.data?.sourceId, 'c'.repeat(32));
    assert.ok((await editor.rpc('publish_course', { cid: id, expected_version: saved.data.version })).error);
    assert.equal((await admin.rpc('publish_course', { cid: id, expected_version: saved.data.version })).error, null);
    assert.equal((await context(a)).data?.block?.data?.sourceId, 'c'.repeat(32));
  });
  await check('malformed protected source rejected by direct save RPC', async () => {
    const current = (await editor.rpc('course_document', { cid: id, draft: true })).data;
    current.modules[0].lessons[0].blocks[0].data.sourceId = 'https://attacker.example.com';
    assert.ok((await editor.rpc('save_course', { doc: current, expected_version: current.version })).error);
  });
  await check('completion unlocks next lesson; revocation denies all new contexts', async () => {
    assert.equal((await a.rpc('record_progress', { lid, complete: true, seconds: 0 })).error, null);
    assert.equal((await context(a, second, secondBlock)).error, null);
    assert.equal((await admin.rpc('set_access', { target_user: accounts[2].id, cid: id, enabled: false })).error, null);
    assert.ok((await context(a)).error); assert.ok((await context(a, second, secondBlock)).error);
  });
  await check('archived course denies playback even in staff preview', async () => {
    assert.equal((await admin.rpc('delete_course', { cid: id })).error, null);
    assert.ok((await context(editor, lid, bid, true)).error);
  });
} finally {
  await admin.rpc('delete_course', { cid: id });
  await Promise.all([admin, editor, a, b, noMfa].map(c => c.auth.signOut({ scope: 'local' })));
  writeFileSync(qaPath('evidence', 'playback-access.json'), JSON.stringify({ scope: 'local Supabase; no external playback', results }, null, 2));
}
if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
