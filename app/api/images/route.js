import { getStoredImage, getViewerImage } from '../../../src/server/images.js';
import { authErrorResponse, requireUser } from '../../../src/server/auth.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!/^[a-f0-9-]{36}$/i.test(id || '')) {
    return Response.json({ message: '올바른 이미지 ID가 아닙니다.' }, { status: 400 });
  }
  try {
    await requireUser(request);
    const image = searchParams.get('variant') === 'viewer'
      ? await getViewerImage(id)
      : await getStoredImage(id);
    if (!image) return Response.json({ message: '이미지를 찾을 수 없습니다.' }, { status: 404 });
    return new Response(image.buffer, {
      headers: {
        'Content-Type': image.mime,
        'Content-Length': String(image.fileSize),
        'Cache-Control': 'private, max-age=31536000, immutable',
        'Content-Security-Policy': "default-src 'none'",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return authErrorResponse(error, '저장된 이미지를 읽지 못했어요.');
  }
}
