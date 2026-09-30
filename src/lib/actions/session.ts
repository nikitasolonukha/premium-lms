'use server';
import { assertStaffAction } from '../server/auth';
import { userLimit } from '../server/limits';
import { userClient } from '../server/supabase';
import { actionResult, databaseError } from '../server/errors';
import { staffSessionSchema } from '../staff-session';
export async function continueStaffSession() {
  return actionResult(async () => {
    await assertStaffAction();
    await userLimit('admin');
    const result = await (await userClient()).rpc('staff_session_status');
    databaseError(result.error);
    return staffSessionSchema.parse(result.data);
  });
}
