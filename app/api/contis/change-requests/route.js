import { authErrorResponse, requireUser } from '../../../../src/server/auth.js';
import { createChangeRequest, listChangeRequests, reviewChangeRequest } from '../../../../src/server/changeRequests.js';
import { listContis } from '../../../../src/server/repository.js';
import { publishContiEvent } from '../../../../src/server/realtime.js';

export async function GET(request) {
  try {
    const actor = await requireUser(request, ['admin', 'leader', 'accompanist']);
    return Response.json({ requests: await listChangeRequests(new URL(request.url).searchParams.get('contiId'), actor) },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return authErrorResponse(error, '변경 요청을 불러오지 못했어요.');
  }
}

export async function POST(request) {
  try {
    const actor = await requireUser(request, ['accompanist']);
    const body = await request.json();
    const result = await createChangeRequest(body, actor);
    publishContiEvent(body.contiId, { type: 'requests.updated' });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return authErrorResponse(error, '변경 요청을 저장하지 못했어요.');
  }
}

export async function PATCH(request) {
  try {
    const actor = await requireUser(request, ['admin', 'leader', 'accompanist']);
    const body = await request.json();
    const result = await reviewChangeRequest(body, actor);
    publishContiEvent(body.contiId, { type: 'requests.updated' });
    if (result.status === 'approved') {
      const conti = (await listContis()).find(item => item.id === body.contiId);
      publishContiEvent(body.contiId, { type: 'conti.updated', conti });
      return Response.json({ ...result, conti });
    }
    return Response.json(result);
  } catch (error) {
    return authErrorResponse(error, '변경 요청을 처리하지 못했어요.');
  }
}
