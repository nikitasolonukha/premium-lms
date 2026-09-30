import { NextResponse, type NextRequest } from 'next/server';
import { userClient } from '@/lib/server/supabase';
import { getActor } from '@/lib/server/auth';
import { privilegedClient } from '@/lib/server/privileged';
import { userLimit } from '@/lib/server/limits';
import { AppError } from '@/lib/server/errors';
import { uuid } from '@/lib/schemas';
import { issueDownloadToken } from '@/lib/download-token';
import { environment, serverSecret } from '@/lib/server/env';
import { reportError } from '@/lib/server/monitoring';
import { imageSize, imageVariantKey } from '@/lib/media-images';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!uuid.safeParse(id).success) return new NextResponse(null, { status: 404 });
    const actor = await getActor();
    if (!actor?.verified) return new NextResponse(null, { status: 401 });
    await userLimit('media');
    const db = await userClient();
    const { data } = await db
      .from('media')
      .select('object_key,filename,mime_type,status,variant_version,video_download_allowed')
      .eq('id', id)
      .eq('status', 'ready')
      .single();
    if (!data) return new NextResponse(null, { status: 404 });
    const download = request.nextUrl.searchParams.get('download') === '1';
    let size;
    try {
      size = imageSize(request.nextUrl.searchParams.get('size'));
    } catch {
      return new NextResponse(null, { status: 400 });
    }
    if (request.nextUrl.searchParams.has('width')) return new NextResponse(null, { status: 400 });
    if (download) {
      if (data.mime_type === 'video/mp4' && !data.video_download_allowed)
        return new NextResponse(null, { status: 403 });
      const token = issueDownloadToken(id, serverSecret('RATE_LIMIT_SECRET'));
      return NextResponse.redirect(new URL(`/api/download/${token}`, environment().appUrl), {
        status: 307,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    if (!download && !data.mime_type.startsWith('image/'))
      return new NextResponse(null, { status: 400 });
    const key =
      !download && data.mime_type.startsWith('image/')
        ? imageVariantKey(data.object_key, size, data.variant_version)
        : data.object_key;
    const signed = await privilegedClient()
      .storage.from('academy-private')
      .createSignedUrl(key, download ? 60 : 300, { download: download ? data.filename : false });
    if (signed.error) throw new AppError('Файл временно недоступен.', 503);
    const response = NextResponse.redirect(signed.data.signedUrl, 307);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    if (status >= 500) await reportError('media.failed', error);
    return NextResponse.json(
      { error: status === 429 ? 'Слишком много запросов' : 'Материал недоступен' },
      {
        status,
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
