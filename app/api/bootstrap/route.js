import { getBootstrapData, saveConti, upsertEvent } from '../../../src/server/repository.js';
import { authErrorResponse, requireUser } from '../../../src/server/auth.js';
import { runDailyCleanupIfDue } from '../../../src/server/maintenance.js';
import { startKeyQueue } from '../../../src/server/keyqueue.js';

export async function GET(request) {
  try {
    await requireUser(request);
    // 첫 요청 때 백그라운드 Key 분석을 켠다(이미 켜져 있으면 무시된다).
    startKeyQueue();
    await runDailyCleanupIfDue().catch(error => {
      console.error('일일 고아 데이터 정리 검사에 실패했습니다.', error);
    });
    return Response.json(await getBootstrapData());
  } catch (error) {
    return authErrorResponse(error, '서버 저장소에 연결하지 못했어요.');
  }
}

export async function POST(request) {
  try {
    const actor = await requireUser(request, ['admin', 'leader']);
    const body = await request.json();
    for (const event of body.events || []) await upsertEvent(event);
    for (const conti of body.contis || []) await saveConti(conti, actor);
    return Response.json(await getBootstrapData());
  } catch (error) {
    return authErrorResponse(error, '기존 데이터를 옮기지 못했어요.');
  }
}
