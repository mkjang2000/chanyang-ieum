import {
  contentDisposition,
  contiFilename,
  createContiPdf,
  ExportError,
} from '../../../../src/server/exports.js';
import { getSharedConti, shareErrorResponse } from '../../../../src/server/shares.js';

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token');
  try {
    const { conti } = await getSharedConti(token);
    const buffer = await createContiPdf(conti);
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(buffer.length),
        'Content-Disposition': contentDisposition(contiFilename(conti)),
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof ExportError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    return shareErrorResponse(error, '공유 콘티 PDF를 만들지 못했어요.');
  }
}
