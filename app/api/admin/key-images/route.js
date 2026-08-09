import { authErrorResponse, requireUser } from '../../../../src/server/auth.js';
import {
  acknowledgeFailedKeyImages, getKeyQueueStatus, listFailedKeyImages, retryFailedKeyImages,
} from '../../../../src/server/keyqueue.js';

const pageOf = request => {
  const { searchParams } = new URL(request.url);
  return {
    page: Number(searchParams.get('page')) || 1,
    pageSize: Number(searchParams.get('pageSize')) || 20,
  };
};

export async function GET(request) {
  try {
    await requireUser(request, ['admin']);
    const [list, status] = await Promise.all([
      listFailedKeyImages(pageOf(request)),
      getKeyQueueStatus(),
    ]);
    return Response.json({ ...list, status }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return authErrorResponse(error, 'Key 인식 실패 목록을 불러오지 못했어요.');
  }
}

export async function POST(request) {
  try {
    await requireUser(request, ['admin']);
    const body = await request.json();
    // ids 를 주지 않으면 실패 전체가 대상이다.
    const ids = Array.isArray(body.ids) ? body.ids : null;
    if (!['retry', 'acknowledge'].includes(body.action)) {
      return Response.json({ message: '지원하지 않는 작업입니다.' }, { status: 400 });
    }
    const result = body.action === 'retry'
      ? await retryFailedKeyImages(ids)
      : await acknowledgeFailedKeyImages(ids);
    // 처리 후 목록이 줄어 현재 페이지가 사라질 수 있다. listFailedKeyImages 가 범위를 맞춰 준다.
    const [list, status] = await Promise.all([
      listFailedKeyImages({ page: Number(body.page) || 1, pageSize: Number(body.pageSize) || 20 }),
      getKeyQueueStatus(),
    ]);
    return Response.json({ ...result, ...list, status });
  } catch (error) {
    return authErrorResponse(error, 'Key 인식 실패 항목을 처리하지 못했어요.');
  }
}
