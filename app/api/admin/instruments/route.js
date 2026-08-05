import { authErrorResponse, requireUser } from '../../../../src/server/auth.js';
import {
  createInstrumentPreset, deleteInstrumentPreset, listInstrumentPresets, updateInstrumentPreset,
} from '../../../../src/server/instruments.js';

export async function GET(request) {
  try {
    await requireUser(request, ['admin']);
    return Response.json({ instruments: await listInstrumentPresets() });
  } catch (error) {
    return authErrorResponse(error, '시작 악기 설정을 불러오지 못했어요.');
  }
}

export async function POST(request) {
  try {
    await requireUser(request, ['admin']);
    return Response.json(await createInstrumentPreset(await request.json()), { status: 201 });
  } catch (error) {
    return authErrorResponse(error, '시작 악기를 추가하지 못했어요.');
  }
}

export async function PATCH(request) {
  try {
    await requireUser(request, ['admin']);
    const body = await request.json();
    return Response.json(await updateInstrumentPreset(body.id, body));
  } catch (error) {
    return authErrorResponse(error, '시작 악기를 저장하지 못했어요.');
  }
}

export async function DELETE(request) {
  try {
    await requireUser(request, ['admin']);
    const id = new URL(request.url).searchParams.get('id');
    await deleteInstrumentPreset(id);
    return Response.json({ deleted: true });
  } catch (error) {
    return authErrorResponse(error, '시작 악기를 삭제하지 못했어요.');
  }
}
