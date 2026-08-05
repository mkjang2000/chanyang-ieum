import { randomUUID } from 'node:crypto';
import { authErrorResponse, requireUser } from '../../../../src/server/auth.js';
import { getPool } from '../../../../src/server/db.js';
import { persistPreparedImage, prepareImageBuffer } from '../../../../src/server/images.js';
import { extractPdfPages, matchKnownSongTitle, MAX_PDF_BYTES, PdfImportError } from '../../../../src/server/pdfimport.js';

export async function POST(request) {
  try {
    await requireUser(request, ['admin', 'leader']);
    const contentLength = Number(request.headers.get('content-length')) || 0;
    if (contentLength > MAX_PDF_BYTES + (1024 * 1024)) {
      throw new PdfImportError('PDF는 25MB 이하여야 합니다.', 413);
    }
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)
      || (file.type && file.type !== 'application/pdf' && !file.name.toLocaleLowerCase().endsWith('.pdf'))) {
      throw new PdfImportError('PDF 파일을 선택해 주세요.');
    }
    const extracted = await extractPdfPages(Buffer.from(await file.arrayBuffer()));
    const [songRows] = await getPool().query('SELECT title FROM songs ORDER BY updated_at DESC LIMIT 2000');
    const knownTitles = songRows.map(row => row.title);
    const knownTitleSet = new Set(knownTitles);
    const pages = [];
    for (let index = 0; index < extracted.length; index += 1) {
      const page = extracted[index];
      const prepared = await prepareImageBuffer(page.buffer, { declaredMime: 'image/png', sourceType: 'pdf' });
      const imageId = await persistPreparedImage(prepared);
      const correctedCandidates = (page.titleCandidates || [page.title])
        .map(candidate => matchKnownSongTitle(candidate, knownTitles));
      const title = correctedCandidates.find(candidate => knownTitleSet.has(candidate))
        || correctedCandidates[0]
        || page.title;
      pages.push({
        id: `p-${randomUUID()}`,
        title,
        key: '',
        memo: '',
        startInstrument: '',
        transitionMode: '',
        imageId,
        image: `/api/images?id=${encodeURIComponent(imageId)}&variant=viewer`,
        sourceType: 'pdf',
        width: prepared.width,
        height: prepared.height,
      });
    }
    return Response.json({ pages });
  } catch (error) {
    if (error instanceof PdfImportError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    return authErrorResponse(error, 'PDF 악보를 가져오지 못했어요.');
  }
}
