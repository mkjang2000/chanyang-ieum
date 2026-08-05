import { authErrorResponse, getAuthStatus } from '../../../../src/server/auth.js';

export async function GET(request) {
  try {
    const result = await getAuthStatus(request);
    return Response.json(
      { setupRequired: result.setupRequired, user: result.user },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          ...(result.setCookie ? { 'Set-Cookie': result.setCookie } : {}),
        },
      },
    );
  } catch (error) {
    return authErrorResponse(error, '로그인 상태를 확인하지 못했어요.');
  }
}
