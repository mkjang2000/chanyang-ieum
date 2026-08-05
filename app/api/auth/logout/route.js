import { authErrorResponse, logout } from '../../../../src/server/auth.js';

export async function POST(request) {
  try {
    return Response.json({ loggedOut: true }, { headers: { 'Set-Cookie': await logout(request) } });
  } catch (error) {
    return authErrorResponse(error, '로그아웃하지 못했어요.');
  }
}
