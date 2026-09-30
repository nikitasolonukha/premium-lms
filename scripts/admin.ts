import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { z } from 'zod';
const [command, emailInput, ...flags] = process.argv.slice(2),
  email = z.email().parse(emailInput);
if (!['create', 'recover-mfa'].includes(command))
  throw new Error('Usage: admin.ts create|recover-mfa email [--confirm=email]');
if (
  !process.env.DATABASE_URL ||
  !process.env.SUPABASE_SECRET_KEY ||
  !process.env.SUPABASE_URL ||
  !process.env.APP_URL
)
  throw new Error(
    'Set DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY and APP_URL in the operator environment.',
  );
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  if (command === 'create') {
    const existing = await db.query(
      "select count(*)::int as n from public.user_roles r join public.profiles p on p.id=r.user_id where r.role='admin' and p.disabled_at is null",
    );
    if (existing.rows[0].n > 0)
      throw new Error(
        'An Admin already exists. Assign additional roles through the MFA-protected application.',
      );
    const invited = await client.auth.admin.inviteUserByEmail(email, {
      redirectTo: new URL('/auth/callback?next=/reset-password', process.env.APP_URL).href,
    });
    if (invited.error)
      throw new Error('Invitation failed. Check SMTP and whether this account already exists.');
    await db.query('begin');
    await db.query('select pg_advisory_xact_lock(77124001)');
    const check = await db.query(
      "select count(*)::int as n from public.user_roles where role='admin'",
    );
    if (check.rows[0].n)
      throw new Error('An Admin was created concurrently. The invited account remains Student.');
    await db.query("update public.user_roles set role='admin',updated_at=now() where user_id=$1", [
      invited.data.user.id,
    ]);
    await db.query(
      "insert into public.audit_logs(action,entity_type,entity_id,metadata) values('operator.bootstrap','user',$1,'{\"method\":\"operator-cli\"}')",
      [invited.data.user.id],
    );
    await db.query('commit');
    console.log(
      'First Admin invited. Open the email, set a password and enroll TOTP before entering Admin.',
    );
  } else {
    if (!flags.includes(`--confirm=${email}`))
      throw new Error(
        'Verify the owner outside the application, then repeat with --confirm=<same-email>. Recovery revokes all sessions and removes MFA factors.',
      );
    const result = await db.query(
      "select u.id from auth.users u join public.user_roles r on r.user_id=u.id where lower(u.email)=lower($1) and r.role in ('admin','editor')",
      [email],
    );
    if (result.rowCount !== 1) throw new Error('Staff account not found.');
    const id = result.rows[0].id;
    // Revoke first; a failed factor deletion leaves the account safely logged out.
    await db.query('delete from auth.sessions where user_id=$1', [id]);
    const factors = await client.auth.admin.mfa.listFactors({ userId: id });
    if (factors.error) throw new Error('Could not list MFA factors.');
    for (const factor of factors.data.factors) {
      const removed = await client.auth.admin.mfa.deleteFactor({ userId: id, id: factor.id });
      if (removed.error) throw new Error('Factor removal failed; sessions were already revoked.');
    }
    await db.query(
      "insert into public.audit_logs(action,entity_type,entity_id,metadata) values('operator.mfa_recovery','user',$1,'{\"sessions_revoked\":true}')",
      [id],
    );
    console.log(
      'MFA reset and all sessions revoked. Staff must sign in with their password and enroll a new authenticator.',
    );
  }
} catch (error) {
  await db.query('rollback');
  console.error(error instanceof Error ? error.message : 'Operator command failed');
  process.exitCode = 1;
} finally {
  await db.end();
}
