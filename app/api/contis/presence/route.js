import { authErrorResponse, requireUser } from '../../../../src/server/auth.js';
import { setEditingPresence } from '../../../../src/server/realtime.js';

export async function POST(request) {
  try {
    const user = await requireUser(request, ['admin', 'leader', 'accompanist']);
    const body = await request.json();
    return Response.json(await setEditingPresence(
      body.contiId,
      body.itemId,
      user,
      body.clientId,
      body.active === true,
    ));
  } catch (error) {
    return authErrorResponse(error, '메모 편집 상태를 갱신하지 못했어요.');
  }
}
