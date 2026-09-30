-- Regression hardening for PostgreSQL's global built-in PUBLIC EXECUTE grant.
alter default privileges revoke execute on functions from public;
revoke execute on all functions in schema public,private from public;
revoke all on all sequences in schema public from public,anon,authenticated;
-- Existing explicit role grants are preserved. In particular, finalization and
-- unauthenticated rate counters remain callable only by service_role.
