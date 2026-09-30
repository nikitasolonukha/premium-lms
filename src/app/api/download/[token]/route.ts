import { NextResponse, type NextRequest } from 'next/server';
import { readDownloadToken } from '@/lib/download-token';
import { serverSecret } from '@/lib/server/env';
import { privilegedClient } from '@/lib/server/privileged';
import { uuid } from '@/lib/schemas';
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const grant = readDownloadToken((await params).token, serverSecret('RATE_LIMIT_SECRET'));
  if (!grant || !uuid.safeParse(grant.id).success)
    return new NextResponse(null, { status: 410, headers: { 'Cache-Control': 'no-store' } });
  const db = privilegedClient(),
    result = await db.rpc('download_asset', { mid: grant.id });
  const data = result.data as { object_key: string; filename: string; mime_type: string } | null;
  if (!data) return new NextResponse(null, { status: 404 });
  const remaining = Math.max(1, grant.expires - Math.floor(Date.now() / 1000));
  const signed = await db.storage
    .from('academy-private')
    .createSignedUrl(data.object_key, remaining);
  if (signed.error) return new NextResponse(null, { status: 503 });
  const upstream = await fetch(signed.data.signedUrl, { cache: 'no-store' });
  if (!upstream.ok) return new NextResponse(null, { status: 503 });
  const filename = encodeURIComponent(data.filename).replace(
    /['()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': data.mime_type,
      'Content-Disposition': `attachment; filename="download"; filename*=UTF-8''${filename}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
