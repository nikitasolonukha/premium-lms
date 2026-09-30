import { NextResponse } from 'next/server';
import { userClient } from '@/lib/server/supabase';
import { getActor } from '@/lib/server/auth';
import { userLimit } from '@/lib/server/limits';
import { AppError } from '@/lib/server/errors';
import { blockSchema, uuid } from '@/lib/schemas';
import { z } from 'zod';
import { resolveVideo } from '@/lib/video';
import {
  createProtectedAdapter,
  protectedProviders,
  PLAYBACK_TTL_SECONDS,
} from '@/lib/protected-video';
import { runtimeEnvironment } from '@/lib/server/env';
import { reportError } from '@/lib/server/monitoring';
import { observeProviderConfiguration } from '@/lib/server/provider-audit';
import { privilegedClient } from '@/lib/server/privileged';
const contextSchema = z.object({ courseId: uuid, revisionId: uuid, block: blockSchema });
export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string; blockId: string }> },
) {
  try {
    const { lessonId, blockId } = await params;
    if (!uuid.safeParse(lessonId).success || !uuid.safeParse(blockId).success)
      return new NextResponse(null, { status: 404 });
    const actor = await getActor();
    if (!actor?.verified) return new NextResponse(null, { status: 401 });
    await userLimit('media');
    const db = await userClient();
    const draft = new URL(request.url).searchParams.get('preview') === '1';
    async function authorizedContext() {
      const result = await db.rpc('playback_context', { lid: lessonId, bid: blockId, draft });
      if (result.error?.code === '42501') throw new AppError('Видео недоступно', 404);
      if (result.error) throw new AppError('Видео временно недоступно', 503);
      return contextSchema.parse(result.data);
    }
    const context = await authorizedContext();
    if (context.block.type !== 'video') throw new AppError('Видео недоступно', 404);
    const source = context.block.data;
    if ('assetId' in source) {
      const media = await db
        .from('media')
        .select('object_key,video_download_allowed')
        .eq('id', source.assetId)
        .eq('status', 'ready')
        .eq('mime_type', 'video/mp4')
        .single();
      if (!media.data) throw new AppError('Видео недоступно', 404);
      const signed = await privilegedClient()
        .storage.from('academy-private')
        .createSignedUrl(media.data.object_key, 300);
      if (signed.error) throw new AppError('Видео временно недоступно', 503);
      const fresh = await authorizedContext();
      if (JSON.stringify(fresh) !== JSON.stringify(context))
        throw new AppError('Урок изменён', 409);
      return NextResponse.json(
        {
          provider: 'upload',
          kind: 'video',
          url: signed.data.signedUrl,
          protected: true,
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          ...(media.data.video_download_allowed
            ? { downloadUrl: `/api/media/${source.assetId}?download=1` }
            : {}),
        },
        { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } },
      );
    }
    if ('sourceId' in source) {
      const env = runtimeEnvironment();
      if (!protectedProviders(env).includes(source.provider))
        throw new AppError('Видеопровайдер не настроен', 503);
      await observeProviderConfiguration();
      const adapter = createProtectedAdapter(source.provider, env, fetch, Date.now, async () => {
        const fresh = await authorizedContext();
        if (JSON.stringify(fresh) !== JSON.stringify(context))
          throw new AppError('Урок изменён. Обновите страницу.', 409);
      });
      const grant = await adapter.issueGrant(source.sourceId, {
        userId: actor.id,
        courseId: context.courseId,
        lessonId,
        ttlSeconds: PLAYBACK_TTL_SECONDS,
      });
      return NextResponse.json(grant, {
        headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
      });
    }
    const settings = await db.rpc('runtime_settings');
    const config = settings.data as { embed_origins?: string[] } | null;
    return NextResponse.json(resolveVideo(source.provider, source.url, config?.embed_origins), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (!(error instanceof AppError) || error.status >= 500)
      await reportError('playback.failed', error);
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
