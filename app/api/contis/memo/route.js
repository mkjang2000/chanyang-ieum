import { authErrorResponse, requireUser } from '../../../../src/server/auth.js';
import { updateContiItemMemo } from '../../../../src/server/repository.js';
import { publishMemoUpdated } from '../../../../src/server/realtime.js';

export async function PATCH(request) {
  try {
    const user = await requireUser(request, ['admin', 'leader', 'accompanist']);
    const body = await request.json();
    if (!body.contiId || !body.itemId) {
      return Response.json({ message: '콘티와 악보 ID가 필요합니다.' }, { status: 400 });
    }
    const saved = await updateContiItemMemo(body.contiId, body.itemId, body.memo);
    publishMemoUpdated(body.contiId, body.itemId, saved.memo, user);
    return Response.json(saved);
  } catch (error) {
    return authErrorResponse(error, '악보 메모를 저장하지 못했어요.');
  }
}
