import { createContiEventStream, loadCueSnapshot } from '../../../../src/server/realtime.js';
import { getValidShare, shareErrorResponse } from '../../../../src/server/shares.js';

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token');
  try {
    const share = await getValidShare(token);
    const cueSnapshot = await loadCueSnapshot(share.contiId);
    return new Response(createContiEventStream(share.contiId, {}, { includeSnapshots: false, cueSnapshot }), {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'private, no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        'Connection': 'keep-alive',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    return shareErrorResponse(error, '공유 콘티 실시간 연결을 열지 못했어요.');
  }
}
