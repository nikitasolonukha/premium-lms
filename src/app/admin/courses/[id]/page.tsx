import { requireActor } from '@/lib/server/auth';
import { getCourseById, getCategories } from '@/lib/server/data';
import { userClient } from '@/lib/server/supabase';
import { EditorLoader } from '@/components/editor/editor-loader';
import type { CourseDraft } from '@/lib/schemas';
import { notFound } from 'next/navigation';
import { protectedProviders } from '@/lib/protected-video';
import { runtimeEnvironment } from '@/lib/server/env';
export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lesson?: string }>;
}) {
  const { id } = await params,
    { lesson } = await searchParams;
  const [actor, categories] = await Promise.all([requireActor('staff'), getCategories()]);
  let course: CourseDraft;
  if (id === 'new') {
    const fresh = crypto.randomUUID();
    course = {
      id: fresh,
      version: 0,
      slug: `novaya-programma-${fresh.slice(0, 8)}`,
      title: 'Новая программа',
      summary: '',
      description: '',
      author: '',
      categoryId: null,
      coverId: null,
      accent: 'blue',
      featured: false,
      accessMode: 'restricted',
      sequential: false,
      tags: [],
      modules: [],
    };
  } else {
    if (!/^[a-f0-9-]{36}$/.test(id)) notFound();
    course = await getCourseById(id, true);
  }
  const media = await (
    await userClient()
  )
    .from('media')
    .select('id,filename,mime_type')
    .eq('status', 'ready')
    .eq('purpose', 'course')
    .order('created_at', { ascending: false })
    .limit(200);
  return (
    <EditorLoader
      initial={course}
      role={actor.role}
      categories={categories}
      media={media.data ?? []}
      initialLesson={lesson}
      protectedProviders={protectedProviders(runtimeEnvironment())}
    />
  );
}
