import { deleteEvent, upsertEvent } from '../../../src/server/repository.js';
import { authErrorResponse, requireUser } from '../../../src/server/auth.js';

export async function POST(request) {
  try {
    await requireUser(request, ['admin', 'leader']);
    return Response.json(await upsertEvent(await request.json()));
  } catch (error) {
    return authErrorResponse(error, '행사를 저장하지 못했어요.');
  }
}

export async function DELETE(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ message: '행사 ID가 필요합니다.' }, { status: 400 });
  try {
    await requireUser(request, ['admin', 'leader']);
    return Response.json({ deleted: await deleteEvent(id) });
  } catch (error) {
    return authErrorResponse(error, '행사를 삭제하지 못했어요.');
  }
}
