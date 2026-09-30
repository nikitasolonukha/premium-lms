import { NextResponse } from 'next/server';
import { getActor } from '@/lib/server/auth';
import { userClient } from '@/lib/server/supabase';
import { staffSessionSchema } from '@/lib/staff-session';
import { reportError } from '@/lib/server/monitoring';
const noStore = { 'Cache-Control': 'private, no-store' };
export async function GET() {
  try {
    // Deliberately do not call requireActor('staff'): polling is not activity.
    const actor = await getActor();
    if (!actor?.verified) return new NextResponse(null, { status: 401, headers: noStore });
    if (actor.role === 'student' || actor.aal !== 'aal2')
      return new NextResponse(null, { status: 403, headers: noStore });
    const result = await (await userClient()).rpc('staff_session_status');
    if (result.error?.code === '42501')
      return new NextResponse(null, { status: 403, headers: noStore });
    if (result.error) throw new Error('Session status unavailable');
    return NextResponse.json(staffSessionSchema.parse(result.data), { headers: noStore });
  } catch (error) {
    await reportError('request.failed', error);
    return new NextResponse(null, { status: 503, headers: noStore });
  }
}
