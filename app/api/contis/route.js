import { loadCueSnapshot, publishContiEvent } from '../../../src/server/realtime.js';
import { deleteConti, saveConti } from '../../../src/server/repository.js';
import { AuthError, authErrorResponse, requireUser } from '../../../src/server/auth.js';

export async function POST(request) {
  try {
    const actor = await requireUser(request, ['admin', 'leader']);
    const conti = await saveConti(await request.json(), actor);
    publishContiEvent(conti.id, { type: 'cue.snapshot', items: await loadCueSnapshot(conti.id) });
    return Response.json(conti);
  } catch (error) {
    // 악보 이미지를 가져오지 못한 경우는 사용자가 다른 이미지를 고르면 해결된다.
    // 원인을 그대로 알려줘야 "왜 안 되는지" 알 수 있다.
    if (!(error instanceof AuthError) && /이미지|악보/.test(error?.message || '')) {
      console.error('콘티 저장 중 악보 이미지 처리 실패', error);
      return Response.json(
        { message: `악보 이미지를 저장하지 못했어요. ${error.message}` },
        { status: 400 },
      );
    }
    return authErrorResponse(error, '콘티를 저장하지 못했어요.');
  }
}

export async function DELETE(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ message: '콘티 ID가 필요합니다.' }, { status: 400 });
  try {
    const actor = await requireUser(request, ['admin', 'leader']);
    return Response.json({ deleted: await deleteConti(id, actor) });
  } catch (error) {
    return authErrorResponse(error, '콘티를 삭제하지 못했어요.');
  }
}
