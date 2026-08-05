import { authErrorResponse, listLoginRecords, requireUser } from '../../../../src/server/auth.js';

export async function GET(request) {
  try {
    await requireUser(request, ['admin']);
    const limit = new URL(request.url).searchParams.get('limit');
    return Response.json({ records: await listLoginRecords(limit) });
  } catch (error) {
    return authErrorResponse(error, '로그인 기록을 불러오지 못했어요.');
  }
}
