import 'server-only';
import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { userClient } from './supabase';
import { databaseError, rpcResult } from './errors';
import { courseSchema, defaultSettings, settingsSchema, uuid, type CourseDraft } from '../schemas';
export type CourseCard = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  author: string;
  cover_id: string | null;
  accent: string;
  featured: boolean;
  category_id: string | null;
  category_name: string | null;
  lesson_count: number;
  module_count: number;
  duration: number;
  completed_count: number;
  progress: number;
  last_activity: string | null;
  last_lesson_id: string | null;
  saved: boolean;
  tags: string[];
  published: boolean;
  has_draft: boolean;
  version: number;
  updated_at: string;
  access_mode: string;
  sequential: boolean;
};
export type PageData<T> = { items: T[]; total: number; page: number; pageSize: number };
export type UserRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  disabled_at: string | null;
  course_count: number;
  created_at: string;
};
export type LibraryRow = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  course_slug: string;
  course_title: string;
  lesson_slug: string;
  lesson_title: string;
};
export type Analytics = {
  users: number;
  active30: number;
  courses: {
    id: string;
    title: string;
    lessons: number;
    enrollments: number;
    started: number;
    completed_lessons: number;
    completions: number;
  }[];
  activity: { day: string; active: number }[];
  recent: {
    first_name: string;
    last_name: string;
    course: string;
    lesson: string;
    last_opened_at: string;
    completed_at: string | null;
  }[];
};
export const getBranding = cache(async () => {
  const { data } = await (await userClient()).rpc('branding');
  const parsed = settingsSchema.safeParse({ ...defaultSettings, ...(data as object) });
  return parsed.success ? parsed.data : defaultSettings;
});
export const getSettings = cache(async () => {
  const { data, error } = await (await userClient()).rpc('runtime_settings');
  databaseError(error);
  const parsed = settingsSchema.safeParse({ ...defaultSettings, ...(data as object) });
  return parsed.success ? parsed.data : defaultSettings;
});
export async function getCatalog(
  input: {
    q?: string;
    category?: string;
    tag?: string;
    sort?: string;
    page?: number;
    staff?: boolean;
    saved?: boolean;
    status?: string;
  } = {},
) {
  if (
    (input.category && !uuid.safeParse(input.category).success) ||
    (input.q !== undefined && (typeof input.q !== 'string' || input.q.length > 200)) ||
    (input.tag !== undefined && (typeof input.tag !== 'string' || input.tag.length > 40)) ||
    (input.sort !== undefined &&
      !['recent', 'title', 'progress', 'featured', 'newest'].includes(input.sort)) ||
    (input.status !== undefined &&
      (!['', 'draft', 'published', 'changed'].includes(input.status) || !input.staff))
  )
    notFound();
  const { data, error } = await (
    await userClient()
  ).rpc('catalog', {
    q: input.q ?? '',
    category: input.category || undefined,
    tag: input.tag ?? '',
    sort: input.sort ?? 'recent',
    page: input.page ?? 1,
    staff: input.staff ?? false,
    saved: input.saved ?? false,
    status_filter: input.status ?? '',
  });
  databaseError(error);
  return rpcResult<PageData<CourseCard>>(data);
}
export const getCategories = cache(async () => {
  const { data, error } = await (await userClient()).from('categories').select('*').order('name');
  databaseError(error);
  return data ?? [];
});
export const getCourseById = cache(async (id: string, draft = false) => {
  const { data, error } = await (await userClient()).rpc('course_document', { cid: id, draft });
  if (error || !data) notFound();
  const parsed = courseSchema.safeParse(data);
  if (!parsed.success) throw new Error('Invalid stored course structure');
  return parsed.data;
});
export const getCourseBySlug = cache(async (slug: string) => {
  const db = await userClient();
  const course = await db.from('courses').select('id,slug').eq('slug', slug).single();
  if (!course.data) {
    const alias = await db.from('slug_aliases').select('course_id').eq('slug', slug).single();
    if (!alias.data) notFound();
    const target = await db.from('courses').select('slug').eq('id', alias.data.course_id).single();
    if (!target.data) notFound();
    permanentRedirect(`/courses/${target.data.slug}`);
  }
  return getCourseById(course.data.id);
});
export const getProgress = cache(async (courseId: string) => {
  const { data, error } = await (await userClient()).rpc('course_progress', { cid: courseId });
  databaseError(error);
  return rpcResult<{ lesson_id: string; completed_at: string | null }[]>(data);
});
export async function getUsers(
  input: { q?: string; role?: string; course?: string; verified?: string; page?: number } = {},
) {
  if (
    (input.course && !uuid.safeParse(input.course).success) ||
    (input.q !== undefined && (typeof input.q !== 'string' || input.q.length > 200))
  )
    notFound();
  const { data, error } = await (
    await userClient()
  ).rpc('list_users', {
    q: input.q ?? '',
    role_filter: input.role ?? '',
    course_filter: input.course || undefined,
    verified_filter: input.verified ?? '',
    page: input.page ?? 1,
  });
  databaseError(error);
  return rpcResult<PageData<UserRow>>(data);
}
export async function getAnalytics() {
  const { data, error } = await (await userClient()).rpc('analytics');
  databaseError(error);
  return rpcResult<Analytics>(data);
}
export async function getStudentSummary() {
  const { data, error } = await (await userClient()).rpc('student_summary');
  databaseError(error);
  return rpcResult<{ courses: number; completedLessons: number }>(data);
}
export async function getLibrary(q = '', page = 1) {
  if (typeof q !== 'string' || q.length > 200) notFound();
  const { data, error } = await (await userClient()).rpc('library', { q, page });
  databaseError(error);
  return rpcResult<PageData<LibraryRow>>(data);
}
export type LessonIndexRow = {
  lesson_id: string;
  title: string;
  slug: string;
  course_slug: string;
  course_title: string;
  available: boolean;
  saved: boolean;
};
export async function getLessonIndex(q = '', page = 1, saved = false) {
  if (typeof q !== 'string' || q.length > 200) notFound();
  const { data, error } = await (await userClient()).rpc('lesson_index', { q, page, saved });
  databaseError(error);
  return rpcResult<PageData<LessonIndexRow>>(data);
}
export async function getTags() {
  const { data, error } = await (
    await userClient()
  )
    .from('tags')
    .select('name')
    .order('name')
    .limit(100);
  databaseError(error);
  return data ?? [];
}
export function flattenLessons(course: CourseDraft) {
  return course.modules.flatMap((m) =>
    m.lessons.filter((l) => l.published).map((l) => ({ ...l, moduleTitle: m.title })),
  );
}
export function pageNumber(value?: string) {
  return Math.max(1, Math.min(10000, Number.parseInt(value ?? '1', 10) || 1));
}
