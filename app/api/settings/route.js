import {
  authErrorResponse, logout, requireUser, updateOwnProfile,
} from '../../../src/server/auth.js';
import {
  getSettings, updatePreferences, updateSystemSettings,
} from '../../../src/server/settings.js';

export async function GET(request) {
  try {
    const user = await requireUser(request);
    return Response.json(await getSettings(user.id));
  } catch (error) {
    return authErrorResponse(error, '환경 설정을 불러오지 못했어요.');
  }
}

export async function PATCH(request) {
  try {
    const user = await requireUser(request);
    const body = await request.json();
    const scope = String(body.scope || '');
    if (scope === 'profile') {
      const result = await updateOwnProfile(user, body);
      const headers = result.passwordChanged
        ? { 'Set-Cookie': await logout(request) }
        : undefined;
      return Response.json(result, { headers });
    }
    if (scope === 'preferences') {
      return Response.json({ preferences: await updatePreferences(user.id, body) });
    }
    if (scope === 'system') {
      return Response.json({ system: await updateSystemSettings(user, body) });
    }
    return Response.json({ message: '저장할 설정 범위를 확인해 주세요.' }, { status: 400 });
  } catch (error) {
    return authErrorResponse(error, '환경 설정을 저장하지 못했어요.');
  }
}
