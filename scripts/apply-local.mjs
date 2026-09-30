// Development-only SQL iteration. Release verification uses `supabase db reset`.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
const root = resolve('supabase/migrations');
const db = new pg.Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:56322/postgres',
});
await db.connect();
try {
  for (const input of process.argv.slice(2)) {
    const path = resolve(input);
    if (relative(root, path).startsWith('..') || !path.endsWith('.sql'))
      throw new Error('Only local migration SQL is accepted');
    await db.query('begin');
    try {
      await db.query(readFileSync(path, 'utf8'));
      await db.query('commit');
      console.log(`Applied ${relative(root, path)}`);
    } catch (error) {
      await db.query('rollback');
      throw error;
    }
  }
} finally {
  await db.end();
}
