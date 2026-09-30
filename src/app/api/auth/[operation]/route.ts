import { NextResponse, type NextRequest } from 'next/server';
import { signIn, register, requestPasswordReset, changePassword } from '@/lib/actions/auth';
import { readJsonBody, BodyError } from '@/lib/bounded-body';
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
    input = await readJsonBody(request.body, 4096);
  } catch (error) {
    const status = error instanceof BodyError ? error.status : 400;
    return NextResponse.json({ ok: false, error: 'Некорректный запрос', status }, { status });
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
