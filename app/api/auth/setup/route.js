import { authErrorResponse, setupFirstAdmin } from '../../../../src/server/auth.js';

export async function POST(request) {
  try {
    const result = await setupFirstAdmin(request, await request.json());
    return Response.json({ user: result.user }, { headers: { 'Set-Cookie': result.setCookie } });
  } catch (error) {
    return authErrorResponse(error, '관리자 계정을 만들지 못했어요.');
  }
}
