import { NextResponse, type NextRequest } from 'next/server';
import { signIn, register, requestPasswordReset, changePassword } from '@/lib/actions/auth';
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ operation: string }> },
) {
  const { operation } = await params;
  if (!['login', 'register', 'forgot', 'reset'].includes(operation))
    return NextResponse.json(
      { ok: false, error: 'Операция не найдена', status: 404 },
      { status: 404 },
    );
  if (Number(request.headers.get('content-length') ?? 0) > 4096)
    return NextResponse.json(
      { ok: false, error: 'Слишком большой запрос', status: 413 },
      { status: 413 },
    );
  let input: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 4096) throw new Error();
    input = JSON.parse(text);
    if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Некорректный запрос', status: 400 },
      { status: 400 },
    );
  }
  const result =
    operation === 'login'
      ? await signIn(input.values, typeof input.next === 'string' ? input.next : undefined)
      : operation === 'register'
        ? await register(input.values)
        : operation === 'forgot'
          ? await requestPasswordReset(input.values)
          : await changePassword(input.values);
  return NextResponse.json(result, {
    status: result.ok ? 200 : result.status,
    headers: {
      'Cache-Control': 'no-store',
      ...(!result.ok && result.retryAfter ? { 'Retry-After': String(result.retryAfter) } : {}),
    },
  });
}
