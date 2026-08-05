import { authErrorResponse, requireUser } from '../../../../src/server/auth.js';
import {
  createFlowSignal, deleteFlowSignal, listFlowSignals, updateFlowSignal,
} from '../../../../src/server/flowSignals.js';

export async function GET(request) {
  try {
    await requireUser(request, ['admin']);
    return Response.json({ signals: await listFlowSignals() });
  } catch (error) {
    return authErrorResponse(error, '진행 알림 설정을 불러오지 못했어요.');
  }
}

export async function POST(request) {
  try {
    await requireUser(request, ['admin']);
    return Response.json(await createFlowSignal(await request.json()), { status: 201 });
  } catch (error) {
    return authErrorResponse(error, '진행 알림을 추가하지 못했어요.');
  }
}

export async function PATCH(request) {
  try {
    await requireUser(request, ['admin']);
    const body = await request.json();
    return Response.json(await updateFlowSignal(body.id, body));
  } catch (error) {
    return authErrorResponse(error, '진행 알림을 저장하지 못했어요.');
  }
}

export async function DELETE(request) {
  try {
    await requireUser(request, ['admin']);
    const id = new URL(request.url).searchParams.get('id');
    await deleteFlowSignal(id);
    return Response.json({ deleted: true });
  } catch (error) {
    return authErrorResponse(error, '진행 알림을 삭제하지 못했어요.');
  }
}
