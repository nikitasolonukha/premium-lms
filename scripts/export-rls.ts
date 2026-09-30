import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const cell = (value: unknown) =>
  String(value ?? '—')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
try {
  const tables = (
    await db.query(
      "select n.nspname schema,c.relname name,c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' order by 1,2",
    )
  ).rows;
  const policies = (
    await db.query(
      "select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','private','storage') order by 1,2,3",
    )
  ).rows;
  const functions = (
    await db.query(
      "select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) args,p.prosecdef definer,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service_role from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') order by 1,2",
    )
  ).rows;
  let md =
    '# RLS / grants / RPC matrix\n\nGenerated from the migrated local PostgreSQL catalog at ' +
    new Date().toISOString() +
    '. These are effective privileges, not inferred permissions.\n\n## Tables\n\n';
  md +=
    '| Schema.table | RLS | Role | SELECT | INSERT | UPDATE | DELETE |\n|---|---|---|---|---|---|---|\n';
  for (const t of [
    ...tables,
    { schema: 'storage', name: 'objects', rls: true },
    { schema: 'storage', name: 'buckets', rls: true },
  ])
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const privileges = (
        await db.query(
          "select has_table_privilege($1,$2,'SELECT') s,has_table_privilege($1,$2,'INSERT') i,has_table_privilege($1,$2,'UPDATE') u,has_table_privilege($1,$2,'DELETE') d",
          [role, `${t.schema}.${t.name}`],
        )
      ).rows[0];
      md += `| ${t.schema}.${t.name} | ${t.rls ? 'yes' : 'no'} | ${role} | ${['s', 'i', 'u', 'd'].map((k) => (privileges[k] ? 'yes' : 'no')).join(' | ')} |\n`;
    }
  md +=
    '\nStorage has platform grants, but no student object policies: direct read and signing are denied. service_role bypasses RLS; its key is server-only and never used for ordinary user reads. private tables are not exposed in the API schemas.\n\n## Policies, operation by operation\n\nAbsent INSERT/UPDATE/DELETE policies plus absent grants mean direct writes are denied. ALL policies, if present below, apply to each operation.\n\n| Table | Policy | Roles | Operation | USING | WITH CHECK |\n|---|---|---|---|---|---|\n';
  for (const p of policies)
    md += `| ${p.schemaname}.${p.tablename} | ${p.policyname} | ${cell(p.roles)} | ${p.cmd} | ${cell(p.qual)} | ${cell(p.with_check)} |\n`;
  md +=
    '\n## Functions\n\nPublic endpoints are invoker wrappers. Private definers enforce live session, DB role, MFA and operation-specific checks before mutation. Internal unvalidated implementations have no client EXECUTE grant. Functions in the private schema cannot be addressed through PostgREST; grants are needed only when invoked by an explicitly exposed wrapper.\n\n| Function(signature) | SECURITY DEFINER | anon EXECUTE | authenticated EXECUTE | service_role EXECUTE |\n|---|---|---|---|---|\n';
  for (const f of functions)
    md += `| ${f.schema}.${f.name}(${cell(f.args)}) | ${f.definer ? 'yes' : 'no'} | ${f.anon ? 'yes' : 'no'} | ${f.authenticated ? 'yes' : 'no'} | ${f.service_role ? 'yes' : 'no'} |\n`;
  const views = (
    await db.query(
      "select schemaname,viewname from pg_views where schemaname in ('public','private')",
    )
  ).rows;
  md +=
    '\n## Views\n\n' +
    (views.length
      ? views.map((v) => `${v.schemaname}.${v.viewname}`).join(', ')
      : 'No application views in public/private.') +
    '\n';
  md +=
    '\n## Verification\n\nRun `npm run test:db` and the local `scripts/test-security.ts` suite. Tests include anonymous, two students, staff without MFA, Editor and Admin; direct table writes; private drafts; Storage read/sign bypass; revoked and expired sessions; stale editing versions; grants after revocation; service-only RPC calls. Regenerate this document after every migration.\n';
  mkdirSync('docs', { recursive: true });
  writeFileSync('docs/RLS_MATRIX.md', md);
  console.log('Exported effective grants, policies and function execution matrix.');
} finally {
  await db.end();
}
