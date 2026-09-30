import { NextResponse } from 'next/server';
import { userClient } from '@/lib/server/supabase';
import { getActor } from '@/lib/server/auth';
import { userLimit } from '@/lib/server/limits';
import { AppError } from '@/lib/server/errors';
import { blockSchema, uuid } from '@/lib/schemas';
import { resolveVideo } from '@/lib/video';
import { reportError } from '@/lib/server/monitoring';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lessonId: string; blockId: string }> },
) {
  try {
    const { lessonId, blockId } = await params;
    if (!uuid.safeParse(lessonId).success || !uuid.safeParse(blockId).success)
      return new NextResponse(null, { status: 404 });
    if (!(await getActor())) return new NextResponse(null, { status: 401 });
    await userLimit('media');
    const db = await userClient();
    const lesson = await db.from('lessons').select('course_id').eq('id', lessonId).single();
    if (!lesson.data) return new NextResponse(null, { status: 404 });
    const course = await db
      .from('courses')
      .select('published_revision_id')
      .eq('id', lesson.data.course_id)
      .single();
    if (!course.data?.published_revision_id) return new NextResponse(null, { status: 404 });
    const block = await db
      .from('lesson_blocks')
      .select('*')
      .eq('revision_id', course.data.published_revision_id)
      .eq('lesson_id', lessonId)
      .eq('id', blockId)
      .single();
    if (!block.data) return new NextResponse(null, { status: 404 });
    const parsed = blockSchema.safeParse({
      id: blockId,
      type: block.data.type,
      version: block.data.schema_version,
      data: block.data.data,
    });
    if (!parsed.success || parsed.data.type !== 'video')
      return new NextResponse(null, { status: 400 });
    const settings = await db.rpc('runtime_settings');
    const config = settings.data as { embed_origins?: string[] } | null;
    return NextResponse.json(
      resolveVideo(parsed.data.data.provider, parsed.data.data.url, config?.embed_origins),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (!(error instanceof AppError) || error.status >= 500) await reportError('playback.failed', error);
    return NextResponse.json(
      { error: 'Видео недоступно' },
      {
        status: error instanceof AppError ? error.status : 500,
        headers: {
          'Cache-Control': 'no-store',
          ...(error instanceof AppError && error.retryAfter
            ? { 'Retry-After': String(error.retryAfter) }
            : {}),
        },
      },
    );
  }
}
