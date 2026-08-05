import { authErrorResponse, requireUser } from '../../../../src/server/auth.js';
import { listAllShareLinks, revokeShareLink } from '../../../../src/server/shares.js';

export async function GET(request) {
  try {
    const actor = await requireUser(request, ['admin']);
    return Response.json({ links: await listAllShareLinks(actor) });
  } catch (error) {
    return authErrorResponse(error, '공유 링크를 불러오지 못했어요.');
  }
}

export async function DELETE(request) {
  try {
    const actor = await requireUser(request, ['admin']);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ message: '공유 링크 ID가 필요합니다.' }, { status: 400 });
    await revokeShareLink(actor, id);
    return Response.json({ revoked: true });
  } catch (error) {
    return authErrorResponse(error, '공유 링크를 폐기하지 못했어요.');
  }
}
