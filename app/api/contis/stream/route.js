import { authErrorResponse, requireUser } from '../../../../src/server/auth.js';
import { assertContiExists, createContiEventStream, loadMemoSnapshot, loadCueSnapshot } from '../../../../src/server/realtime.js';

export async function GET(request) {
  try {
    await requireUser(request);
    const contiId = new URL(request.url).searchParams.get('id');
    if (!contiId) return Response.json({ message: '콘티 ID가 필요합니다.' }, { status: 400 });
    await assertContiExists(contiId);
    const [memoSnapshot, cueSnapshot] = await Promise.all([loadMemoSnapshot(contiId), loadCueSnapshot(contiId)]);
    return new Response(createContiEventStream(contiId, memoSnapshot, { cueSnapshot }), {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return authErrorResponse(error, '실시간 연결을 열지 못했어요.');
  }
}
