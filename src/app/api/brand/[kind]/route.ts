import { NextResponse } from 'next/server';
import { privilegedClient } from '@/lib/server/privileged';
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!['logo', 'favicon'].includes(kind)) return new NextResponse(null, { status: 404 });
  const client = privilegedClient();
  const { data, error } = await client.rpc('branding_media', { kind });
  if (!error && data) {
    const signed = await client.storage
      .from('academy-private')
      .createSignedUrl(`${data}.webp`, 300);
    if (signed.data) return NextResponse.redirect(signed.data.signedUrl, 307);
  }
  return new NextResponse(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="17" fill="#26352b"/><path d="M9 26l23-11 23 11-23 11zm9 5v14c9 7 19 7 28 0V31" fill="none" stroke="#edf5e0" stroke-width="3" stroke-linejoin="round"/></svg>',
    { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public,max-age=60' } },
  );
}
