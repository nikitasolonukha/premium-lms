# RLS / grants / RPC matrix

Generated from the migrated local PostgreSQL catalog at 2026-09-30T18:30:31.307Z. These are effective privileges, not inferred permissions.

## Tables

| Schema.table | RLS | Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|---|
| private.admin_sessions | yes | anon | no | no | no | no |
| private.admin_sessions | yes | authenticated | no | no | no | no |
| private.admin_sessions | yes | service_role | no | no | no | no |
| private.automation_rules | yes | anon | no | no | no | no |
| private.automation_rules | yes | authenticated | no | no | no | no |
| private.automation_rules | yes | service_role | no | no | no | no |
| private.bulk_requests | yes | anon | no | no | no | no |
| private.bulk_requests | yes | authenticated | no | no | no | no |
| private.bulk_requests | yes | service_role | no | no | no | no |
| private.operations_jobs | yes | anon | no | no | no | no |
| private.operations_jobs | yes | authenticated | no | no | no | no |
| private.operations_jobs | yes | service_role | no | no | no | no |
| private.rate_limits | yes | anon | no | no | no | no |
| private.rate_limits | yes | authenticated | no | no | no | no |
| private.rate_limits | yes | service_role | no | no | no | no |
| private.telegram_connections | yes | anon | no | no | no | no |
| private.telegram_connections | yes | authenticated | no | no | no | no |
| private.telegram_connections | yes | service_role | no | no | no | no |
| private.telegram_links | yes | anon | no | no | no | no |
| private.telegram_links | yes | authenticated | no | no | no | no |
| private.telegram_links | yes | service_role | no | no | no | no |
| private.telegram_updates | yes | anon | no | no | no | no |
| private.telegram_updates | yes | authenticated | no | no | no | no |
| private.telegram_updates | yes | service_role | no | no | no | no |
| private.video_config_state | yes | anon | no | no | no | no |
| private.video_config_state | yes | authenticated | no | no | no | no |
| private.video_config_state | yes | service_role | no | no | no | no |
| private.worker_status | yes | anon | no | no | no | no |
| private.worker_status | yes | authenticated | no | no | no | no |
| private.worker_status | yes | service_role | no | no | no | no |
| public.access_grants | yes | anon | no | no | no | no |
| public.access_grants | yes | authenticated | yes | no | no | no |
| public.access_grants | yes | service_role | no | no | no | no |
| public.audit_logs | yes | anon | no | no | no | no |
| public.audit_logs | yes | authenticated | yes | no | no | no |
| public.audit_logs | yes | service_role | no | no | no | no |
| public.block_assets | yes | anon | no | no | no | no |
| public.block_assets | yes | authenticated | yes | no | no | no |
| public.block_assets | yes | service_role | no | no | no | no |
| public.categories | yes | anon | no | no | no | no |
| public.categories | yes | authenticated | yes | no | no | no |
| public.categories | yes | service_role | no | no | no | no |
| public.course_revisions | yes | anon | no | no | no | no |
| public.course_revisions | yes | authenticated | yes | no | no | no |
| public.course_revisions | yes | service_role | no | no | no | no |
| public.courses | yes | anon | no | no | no | no |
| public.courses | yes | authenticated | yes | no | no | no |
| public.courses | yes | service_role | no | no | no | no |
| public.enrollments | yes | anon | no | no | no | no |
| public.enrollments | yes | authenticated | yes | no | no | no |
| public.enrollments | yes | service_role | no | no | no | no |
| public.learning_activity | yes | anon | no | no | no | no |
| public.learning_activity | yes | authenticated | yes | no | no | no |
| public.learning_activity | yes | service_role | no | no | no | no |
| public.lesson_blocks | yes | anon | no | no | no | no |
| public.lesson_blocks | yes | authenticated | yes | no | no | no |
| public.lesson_blocks | yes | service_role | no | no | no | no |
| public.lesson_revisions | yes | anon | no | no | no | no |
| public.lesson_revisions | yes | authenticated | yes | no | no | no |
| public.lesson_revisions | yes | service_role | no | no | no | no |
| public.lesson_slug_aliases | yes | anon | no | no | no | no |
| public.lesson_slug_aliases | yes | authenticated | yes | no | no | no |
| public.lesson_slug_aliases | yes | service_role | no | no | no | no |
| public.lessons | yes | anon | no | no | no | no |
| public.lessons | yes | authenticated | yes | no | no | no |
| public.lessons | yes | service_role | no | no | no | no |
| public.media | yes | anon | no | no | no | no |
| public.media | yes | authenticated | yes | no | no | no |
| public.media | yes | service_role | no | no | no | no |
| public.module_revisions | yes | anon | no | no | no | no |
| public.module_revisions | yes | authenticated | yes | no | no | no |
| public.module_revisions | yes | service_role | no | no | no | no |
| public.modules | yes | anon | no | no | no | no |
| public.modules | yes | authenticated | yes | no | no | no |
| public.modules | yes | service_role | no | no | no | no |
| public.profiles | yes | anon | no | no | no | no |
| public.profiles | yes | authenticated | yes | no | no | no |
| public.profiles | yes | service_role | no | no | no | no |
| public.progress | yes | anon | no | no | no | no |
| public.progress | yes | authenticated | yes | no | no | no |
| public.progress | yes | service_role | no | no | no | no |
| public.revision_tags | yes | anon | no | no | no | no |
| public.revision_tags | yes | authenticated | yes | no | no | no |
| public.revision_tags | yes | service_role | no | no | no | no |
| public.saved_items | yes | anon | no | no | no | no |
| public.saved_items | yes | authenticated | yes | no | no | no |
| public.saved_items | yes | service_role | no | no | no | no |
| public.settings | yes | anon | no | no | no | no |
| public.settings | yes | authenticated | yes | no | no | no |
| public.settings | yes | service_role | no | no | no | no |
| public.slug_aliases | yes | anon | no | no | no | no |
| public.slug_aliases | yes | authenticated | yes | no | no | no |
| public.slug_aliases | yes | service_role | no | no | no | no |
| public.tags | yes | anon | no | no | no | no |
| public.tags | yes | authenticated | yes | no | no | no |
| public.tags | yes | service_role | no | no | no | no |
| public.user_roles | yes | anon | no | no | no | no |
| public.user_roles | yes | authenticated | yes | no | no | no |
| public.user_roles | yes | service_role | no | no | no | no |
| storage.objects | yes | anon | yes | yes | yes | yes |
| storage.objects | yes | authenticated | yes | yes | yes | yes |
| storage.objects | yes | service_role | yes | yes | yes | yes |
| storage.buckets | yes | anon | yes | yes | yes | yes |
| storage.buckets | yes | authenticated | yes | yes | yes | yes |
| storage.buckets | yes | service_role | yes | yes | yes | yes |

Storage has platform grants, but no student object policies: direct read and signing are denied. service_role bypasses RLS; its key is server-only and never used for ordinary user reads. private tables are not exposed in the API schemas.

## Policies, operation by operation

Absent INSERT/UPDATE/DELETE policies plus absent grants mean direct writes are denied. ALL policies, if present below, apply to each operation.

| Table | Policy | Roles | Operation | USING | WITH CHECK |
|---|---|---|---|---|---|
| public.access_grants | grants_read | {authenticated} | SELECT | (EXISTS ( SELECT 1    FROM enrollments e   WHERE (e.id = access_grants.enrollment_id))) | — |
| public.audit_logs | audit_read | {authenticated} | SELECT | private.is_staff(true) | — |
| public.block_assets | block_assets_read | {authenticated} | SELECT | (( SELECT private.is_staff() AS is_staff) OR (private.can_revision(revision_id) AND private.can_media(media_id))) | — |
| public.categories | categories_read | {authenticated} | SELECT | private.live_session() | — |
| public.course_revisions | revisions_read | {authenticated} | SELECT | (id IN ( SELECT unnest(private.readable_revisions()) AS unnest)) | — |
| public.courses | courses_read | {authenticated} | SELECT | ((deleted_at IS NULL) AND (( SELECT private.is_staff() AS is_staff) OR private.has_course(id))) | — |
| public.enrollments | enrollments_read | {authenticated} | SELECT | (private.live_session() AND ((user_id = ( SELECT auth.uid() AS uid)) OR private.is_staff(true))) | — |
| public.learning_activity | learning_activity_read | {authenticated} | SELECT | (private.live_session() AND ((user_id = ( SELECT auth.uid() AS uid)) OR private.is_staff(true))) | — |
| public.lesson_blocks | blocks_read | {authenticated} | SELECT | (( SELECT private.is_staff() AS is_staff) OR (private.can_revision(revision_id) AND private.lesson_available(lesson_id))) | — |
| public.lesson_revisions | lesson_revision_read | {authenticated} | SELECT | (( SELECT private.is_staff() AS is_staff) OR (published AND (revision_id IN ( SELECT unnest(private.readable_revisions()) AS unnest)))) | — |
| public.lesson_slug_aliases | lesson_aliases_read | {authenticated} | SELECT | (private.is_staff() OR private.has_course(course_id)) | — |
| public.lessons | lessons_read | {authenticated} | SELECT | (private.is_staff() OR (private.has_course(course_id) AND (EXISTS ( SELECT 1    FROM (courses c      JOIN lesson_revisions l ON ((l.revision_id = c.published_revision_id)))   WHERE ((c.id = l.course_id) AND (l.lesson_id = lessons.id) AND l.published))))) | — |
| public.media | media_read | {authenticated} | SELECT | ((( SELECT private.is_staff() AS is_staff) AND (status <> 'deleted'::text)) OR private.can_media(id) OR (( SELECT private.live_session() AS live_session) AND (owner_id = ( SELECT auth.uid() AS uid)) AND (purpose = 'avatar'::text))) | — |
| public.module_revisions | module_revision_read | {authenticated} | SELECT | (revision_id IN ( SELECT unnest(private.readable_revisions()) AS unnest)) | — |
| public.modules | modules_read | {authenticated} | SELECT | (private.is_staff() OR (private.has_course(course_id) AND (EXISTS ( SELECT 1    FROM (courses c      JOIN module_revisions m ON ((m.revision_id = c.published_revision_id)))   WHERE ((c.id = m.course_id) AND (m.module_id = modules.id)))))) | — |
| public.profiles | profile_read | {authenticated} | SELECT | (private.live_session() AND ((id = ( SELECT auth.uid() AS uid)) OR private.is_staff(true))) | — |
| public.progress | progress_read | {authenticated} | SELECT | (( SELECT private.live_session() AS live_session) AND ((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_staff(true) AS is_staff))) | — |
| public.revision_tags | revision_tags_read | {authenticated} | SELECT | (revision_id IN ( SELECT unnest(private.readable_revisions()) AS unnest)) | — |
| public.saved_items | saved_read | {authenticated} | SELECT | ((user_id = ( SELECT auth.uid() AS uid)) AND private.has_course(course_id) AND ((lesson_id IS NULL) OR private.lesson_available(lesson_id))) | — |
| public.settings | settings_read | {authenticated} | SELECT | private.is_staff(true) | — |
| public.slug_aliases | aliases_read | {authenticated} | SELECT | (private.is_staff() OR private.has_course(course_id)) | — |
| public.tags | tags_read | {authenticated} | SELECT | (private.live_session() AND (private.is_staff() OR (EXISTS ( SELECT 1    FROM revision_tags rt   WHERE ((rt.tag_id = tags.id) AND private.can_revision(rt.revision_id)))))) | — |
| public.user_roles | role_read | {authenticated} | SELECT | (private.live_session() AND ((user_id = ( SELECT auth.uid() AS uid)) OR private.is_staff(true))) | — |

## Functions

Public endpoints are invoker wrappers. Private definers enforce live session, DB role, MFA and operation-specific checks before mutation. Internal unvalidated implementations have no client EXECUTE grant. Functions in the private schema cannot be addressed through PostgREST; grants are needed only when invoked by an explicitly exposed wrapper.

| Function(signature) | SECURITY DEFINER | anon EXECUTE | authenticated EXECUTE | service_role EXECUTE |
|---|---|---|---|---|
| private.active_operator(uid uuid, staff boolean) | yes | no | no | no |
| private.analytics() | yes | no | yes | no |
| private.analytics_page(page integer) | yes | no | yes | no |
| private.audit_index(q_action text, q_actor text, q_entity text, date_from text, date_to text, page integer) | yes | no | yes | no |
| private.branding() | yes | yes | yes | no |
| private.branding_media(kind text) | yes | no | no | yes |
| private.can_media(mid uuid) | yes | no | yes | no |
| private.can_revision(rid uuid) | yes | no | yes | no |
| private.consume_limit(k text, maximum integer, seconds integer) | yes | no | no | no |
| private.course_document(cid uuid, draft boolean) | yes | no | yes | no |
| private.create_media(mid uuid, filename text, mime_type text, size_bytes bigint, purpose text) | yes | no | yes | no |
| private.delete_course(cid uuid) | yes | no | yes | no |
| private.delete_media(mid uuid) | yes | no | yes | no |
| private.download_asset(mid uuid) | yes | no | no | yes |
| private.finalize_media(mid uuid, owner uuid, sha text, width integer, height integer, accepted boolean) | yes | no | no | yes |
| private.finalize_media_v2(mid uuid, owner uuid, sha text, session_id uuid, width integer, height integer, accepted boolean, variant_version integer) | yes | no | no | yes |
| private.has_course(cid uuid) | yes | no | yes | no |
| private.is_staff(admin_only boolean) | yes | no | yes | no |
| private.lesson_available(lid uuid) | yes | no | yes | no |
| private.list_users(q text, role_filter text, course_filter uuid, verified_filter text, page integer) | yes | no | yes | no |
| private.live_session() | yes | no | yes | no |
| private.mutate_category(cid uuid, label text, color text, remove boolean) | yes | no | yes | no |
| private.new_user() | yes | no | no | no |
| private.next_automation_time(freq text, h integer, m integer, wd integer, tz text, after_time timestamp with time zone) | no | no | no | no |
| private.observe_video_config(environment text, fingerprint text, cloudflare boolean, mux boolean) | yes | no | no | yes |
| private.operations(op text, payload jsonb) | yes | no | yes | no |
| private.operations_grant(actor uuid, target uuid, cid uuid, enabled boolean) | yes | no | no | no |
| private.owner_report(kind text, cid uuid) | yes | no | no | no |
| private.playback_context(lid uuid, bid uuid, draft boolean) | yes | no | yes | no |
| private.publish_course(cid uuid, expected_version integer) | yes | no | yes | no |
| private.readable_revisions() | yes | no | yes | no |
| private.record_progress(lid uuid, complete boolean, seconds integer) | yes | no | yes | no |
| private.require_staff(admin_only boolean) | yes | no | no | no |
| private.runtime_settings() | yes | no | yes | no |
| private.safe_https(value text) | no | no | no | no |
| private.save_course(doc jsonb, expected_version integer) | yes | no | yes | no |
| private.save_course_unvalidated(doc jsonb, expected_version integer) | yes | no | no | no |
| private.save_item(cid uuid, lid uuid, enabled boolean) | yes | no | yes | no |
| private.service_limit(k text, maximum integer, seconds integer) | yes | no | no | yes |
| private.set_access(target_user uuid, cid uuid, enabled boolean) | yes | no | yes | no |
| private.set_role(target_user uuid, new_role text) | yes | no | yes | no |
| private.set_user_disabled(target_user uuid, disabled boolean) | yes | no | yes | no |
| private.staff_identity(admin_only boolean) | yes | no | yes | no |
| private.staff_session_status() | yes | no | yes | no |
| private.student_card(target uuid, page integer) | yes | no | no | no |
| private.touch_staff_session() | yes | no | yes | no |
| private.track_learning() | yes | no | no | no |
| private.update_profile(first_name text, last_name text, avatar_id uuid) | yes | no | yes | no |
| private.update_settings(doc jsonb) | yes | no | yes | no |
| private.update_settings_unvalidated(doc jsonb) | yes | no | no | no |
| private.user_limit(kind text) | yes | no | yes | no |
| private.validate_semantics(doc jsonb, settings_doc boolean) | no | no | no | no |
| private.validate_semantics_base(doc jsonb, settings_doc boolean) | no | no | no | no |
| private.worker_api(op text, payload jsonb) | yes | no | no | yes |
| public.analytics() | no | no | yes | no |
| public.analytics_page(page integer) | no | no | yes | no |
| public.audit_index(q_action text, q_actor text, q_entity text, date_from text, date_to text, page integer) | no | no | yes | no |
| public.branding() | no | yes | yes | no |
| public.branding_media(kind text) | no | no | no | yes |
| public.catalog(q text, category uuid, tag text, sort text, page integer, staff boolean, saved boolean, status_filter text) | no | no | yes | no |
| public.consume_service_limit(k text, maximum integer, seconds integer) | no | no | no | yes |
| public.consume_user_limit(kind text) | no | no | yes | no |
| public.course_document(cid uuid, draft boolean) | no | no | yes | no |
| public.course_progress(cid uuid) | no | no | yes | no |
| public.create_media(mid uuid, filename text, mime_type text, size_bytes bigint, purpose text) | no | no | yes | no |
| public.delete_course(cid uuid) | no | no | yes | no |
| public.delete_media(mid uuid) | no | no | yes | no |
| public.download_asset(mid uuid) | no | no | no | yes |
| public.finalize_media(mid uuid, owner uuid, sha text, width integer, height integer, accepted boolean) | no | no | no | yes |
| public.finalize_media_v2(mid uuid, owner uuid, sha text, session_id uuid, width integer, height integer, accepted boolean, variant_version integer) | no | no | no | yes |
| public.lesson_index(q text, page integer, saved boolean) | no | no | yes | no |
| public.library(q text, page integer) | no | no | yes | no |
| public.list_users(q text, role_filter text, course_filter uuid, verified_filter text, page integer) | no | no | yes | no |
| public.mutate_category(cid uuid, label text, color text, remove boolean) | no | no | yes | no |
| public.observe_video_config(environment text, fingerprint text, cloudflare boolean, mux boolean) | no | no | no | yes |
| public.operations(op text, payload jsonb) | no | no | yes | no |
| public.playback_context(lid uuid, bid uuid, draft boolean) | no | no | yes | no |
| public.publish_course(cid uuid, expected_version integer) | no | no | yes | no |
| public.record_progress(lid uuid, complete boolean, seconds integer) | no | no | yes | no |
| public.runtime_settings() | no | no | yes | no |
| public.save_course(doc jsonb, expected_version integer) | no | no | yes | no |
| public.save_item(cid uuid, lid uuid, enabled boolean) | no | no | yes | no |
| public.set_access(target_user uuid, cid uuid, enabled boolean) | no | no | yes | no |
| public.set_role(target_user uuid, new_role text) | no | no | yes | no |
| public.set_user_disabled(target_user uuid, disabled boolean) | no | no | yes | no |
| public.staff_session_status() | no | no | yes | no |
| public.student_summary() | no | no | yes | no |
| public.touch_staff_session() | no | no | yes | no |
| public.update_profile(first_name text, last_name text, avatar_id uuid) | no | no | yes | no |
| public.update_settings(doc jsonb) | no | no | yes | no |
| public.worker_api(op text, payload jsonb) | no | no | no | yes |

## Views

No application views in public/private.

## Verification

Run `npm run test:db` and the local `scripts/test-security.ts` suite. Tests include anonymous, two students, staff without MFA, Editor and Admin; direct table writes; private drafts; Storage read/sign bypass; revoked and expired sessions; stale editing versions; grants after revocation; service-only RPC calls. Regenerate this document after every migration.
