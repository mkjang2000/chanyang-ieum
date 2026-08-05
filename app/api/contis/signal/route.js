import { authErrorResponse, requireUser } from '../../../../src/server/auth.js';
import { getFlowSignal } from '../../../../src/server/flowSignals.js';
import { publishFlowSignal } from '../../../../src/server/realtime.js';
import { assertCanManageConti } from '../../../../src/server/repository.js';

export async function POST(request) {
  try {
    const actor = await requireUser(request, ['admin', 'leader']);
    const body = await request.json();
    const contiId = String(body.contiId || '');
    const signalId = String(body.signal || '');
    if (!contiId || !signalId) {
      return Response.json({ message: '진행 알림 정보가 올바르지 않습니다.' }, { status: 400 });
    }
    await assertCanManageConti(contiId, actor);
    const signal = await getFlowSignal(signalId);
    return Response.json(publishFlowSignal(contiId, signal, actor));
  } catch (error) {
    return authErrorResponse(error, '진행 알림을 보내지 못했어요.');
  }
}
