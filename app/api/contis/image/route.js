import { authErrorResponse, requireUser } from '../../../../src/server/auth.js';
import {
  contentDisposition,
  ExportError,
  getContiImageDownload,
} from '../../../../src/server/exports.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const contiId = searchParams.get('contiId');
  const itemId = searchParams.get('itemId');
  if (!contiId || !itemId) {
    return Response.json({ message: '콘티와 악보 ID가 필요합니다.' }, { status: 400 });
  }
  try {
    await requireUser(request);
    const image = await getContiImageDownload(contiId, itemId);
    return new Response(image.buffer, {
      headers: {
        'Content-Type': image.mime,
        'Content-Length': String(image.fileSize),
        'Content-Disposition': contentDisposition(image.filename),
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': "default-src 'none'",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof ExportError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    return authErrorResponse(error, '악보를 다운로드하지 못했어요.');
  }
}
