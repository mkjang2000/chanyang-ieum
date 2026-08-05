import { authErrorResponse, requireUser } from '../../../../src/server/auth.js';
import {
  getMaintenanceStatus, runOrphanCleanup,
} from '../../../../src/server/maintenance.js';

export async function GET(request) {
  try {
    await requireUser(request, ['admin']);
    return Response.json(await getMaintenanceStatus());
  } catch (error) {
    return authErrorResponse(error, '정리 상태를 불러오지 못했어요.');
  }
}

export async function POST(request) {
  try {
    await requireUser(request, ['admin']);
    const result = await runOrphanCleanup({ force: true });
    return Response.json({ result, status: await getMaintenanceStatus() });
  } catch (error) {
    return authErrorResponse(error, '사용하지 않는 데이터를 정리하지 못했어요.');
  }
}
