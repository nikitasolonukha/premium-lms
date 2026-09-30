import pg from 'pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { staffClient } from '../tests/e2e/db-fixtures';
import { accounts } from '../tests/e2e/helpers';
const address = new URL(process.env.DATABASE_URL!);
if (!['localhost', '127.0.0.1'].includes(address.hostname) || address.port !== '56322') throw new Error('Local QA only');
const staff = await staffClient(), claims = (await staff.auth.getClaims()).data!.claims;
const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
try {
  await db.query('begin');
  const id = randomUUID(), owner = accounts[0].id;
  const insert = (mid: string) => db.query("insert into public.media(id,owner_id,object_key,filename,mime_type,size_bytes,status,purpose) values($1,$2,$3,'fixture.png','image/png',100,'pending','course')", [mid, owner, `${owner}/${mid}`]);
  await insert(id);
  const args = [id, owner, 'a'.repeat(64), claims.session_id];
  assert.equal((await db.query('select private.finalize_media_v2($1,$2,$3,$4,480,300,true,1) ok', args)).rows[0].ok, true);
  assert.equal((await db.query('select variant_version from public.media where id=$1', [id])).rows[0].variant_version, 1);
  assert.equal((await db.query('select private.finalize_media_v2($1,$2,$3,$4,null,null,false,0) ok', args)).rows[0].ok, false, 'a late rejected finalize cannot replace ready state');
  assert.equal((await db.query('select status from public.media where id=$1', [id])).rows[0].status, 'ready');
  assert.equal((await db.query("select has_function_privilege('authenticated','public.finalize_media_v2(uuid,uuid,text,uuid,integer,integer,boolean,integer)','EXECUTE') allowed")).rows[0].allowed, false);
  const pending = randomUUID(); await insert(pending);
  await db.query('delete from auth.sessions where id=$1', [claims.session_id]);
  let denied = false;
  try { await db.query('select private.finalize_media_v2($1,$2,$3,$4,480,300,true,1)', [pending, owner, 'b'.repeat(64), claims.session_id]); }
  catch (error) { denied = !!error && typeof error === 'object' && 'code' in error && error.code === '42501'; }
  assert.equal(denied, true, 'revocation during inspection prevents finalize');
  console.log('PASS: media finalization variants, race protection, service-only grants and session revocation');
} finally { await db.query('rollback'); await db.end(); await staff.auth.signOut({ scope: 'local' }); }
