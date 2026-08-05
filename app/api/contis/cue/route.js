import { authErrorResponse, requireUser } from '../../../../src/server/auth.js';
import { assertCanManageConti, updateContiItemCue } from '../../../../src/server/repository.js';

export async function PATCH(request) {
  try {
    const actor = await requireUser(request, ['admin', 'leader']);
    const body = await request.json();
    if (!body.contiId || !body.itemId) {
      return Response.json({ message: '콘티와 악보 ID가 필요합니다.' }, { status: 400 });
    }
    await assertCanManageConti(body.contiId, actor);
    return Response.json(await updateContiItemCue(body.contiId, body.itemId, body));
  } catch (error) {
    return authErrorResponse(error, '악보 진행 표시를 저장하지 못했어요.');
  }
}
