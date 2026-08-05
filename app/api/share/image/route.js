import { getStoredImage, getViewerImage } from '../../../../src/server/images.js';
import { getSharedConti, ShareError, shareErrorResponse } from '../../../../src/server/shares.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const id = searchParams.get('id');
  try {
    const { conti } = await getSharedConti(token);
    if (!conti.pages.some(page => page.imageId === id)) {
      throw new ShareError('공유된 콘티에 없는 악보입니다.', 404);
    }
    const image = searchParams.get('variant') === 'viewer'
      ? await getViewerImage(id)
      : await getStoredImage(id);
    if (!image) throw new ShareError('악보 파일을 찾을 수 없습니다.', 404);
    return new Response(image.buffer, {
      headers: {
        'Content-Type': image.mime,
        'Content-Length': String(image.fileSize),
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': "default-src 'none'",
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return shareErrorResponse(error, '공유된 악보를 읽지 못했어요.');
  }
}
