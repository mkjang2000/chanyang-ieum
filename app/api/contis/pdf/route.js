import { authErrorResponse, requireUser } from '../../../../src/server/auth.js';
import {
  contentDisposition,
  contiFilename,
  createContiPdf,
  ExportError,
  getContiForExport,
} from '../../../../src/server/exports.js';

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ message: '콘티 ID가 필요합니다.' }, { status: 400 });
  try {
    await requireUser(request);
    const conti = await getContiForExport(id);
    if (!conti) return Response.json({ message: '콘티를 찾을 수 없습니다.' }, { status: 404 });
    const buffer = await createContiPdf(conti);
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(buffer.length),
        'Content-Disposition': contentDisposition(contiFilename(conti)),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof ExportError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    return authErrorResponse(error, '콘티 PDF를 만들지 못했어요.');
  }
}
