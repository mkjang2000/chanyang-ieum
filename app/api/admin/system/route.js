import { authErrorResponse, requireUser } from '../../../../src/server/auth.js';
import { getSystemStatus } from '../../../../src/server/system.js';

export async function GET(request) {
  try {
    await requireUser(request, ['admin']);
    return Response.json(await getSystemStatus(), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return authErrorResponse(error, '시스템 상태를 확인하지 못했어요.');
  }
}
