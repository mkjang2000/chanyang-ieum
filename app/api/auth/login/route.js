import { authErrorResponse, login } from '../../../../src/server/auth.js';

export async function POST(request) {
  try {
    const result = await login(request, await request.json());
    return Response.json({ user: result.user }, { headers: { 'Set-Cookie': result.setCookie } });
  } catch (error) {
    return authErrorResponse(error, '로그인하지 못했어요.');
  }
}
