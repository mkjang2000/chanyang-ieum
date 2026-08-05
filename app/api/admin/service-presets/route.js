import { authErrorResponse, requireUser } from '../../../../src/server/auth.js';
import {
  createServicePreset, deleteServicePreset, listServicePresets, updateServicePreset,
} from '../../../../src/server/presets.js';

export async function GET(request) {
  try {
    await requireUser(request, ['admin']);
    return Response.json({ presets: await listServicePresets() });
  } catch (error) {
    return authErrorResponse(error, '예배 프리셋을 불러오지 못했어요.');
  }
}

export async function POST(request) {
  try {
    await requireUser(request, ['admin']);
    return Response.json(await createServicePreset(await request.json()), { status: 201 });
  } catch (error) {
    return authErrorResponse(error, '예배 프리셋을 만들지 못했어요.');
  }
}

export async function PATCH(request) {
  try {
    await requireUser(request, ['admin']);
    return Response.json(await updateServicePreset(await request.json()));
  } catch (error) {
    return authErrorResponse(error, '예배 프리셋을 저장하지 못했어요.');
  }
}

export async function DELETE(request) {
  try {
    await requireUser(request, ['admin']);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ message: '예배 프리셋 ID가 필요합니다.' }, { status: 400 });
    return Response.json({ deleted: await deleteServicePreset(id) });
  } catch (error) {
    return authErrorResponse(error, '예배 프리셋을 삭제하지 못했어요.');
  }
}
