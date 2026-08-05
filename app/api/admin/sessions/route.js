import { authErrorResponse, forceLogoutUser, requireUser } from '../../../../src/server/auth.js';

export async function POST(request) {
  try {
    const actor = await requireUser(request, ['admin']);
    const { userId } = await request.json();
    const ended = await forceLogoutUser(String(userId || ''));
    return Response.json({ ended, self: actor.id === userId });
  } catch (error) {
    return authErrorResponse(error, '사용자를 로그아웃하지 못했어요.');
  }
}
