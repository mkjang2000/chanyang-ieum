import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';

const run = promisify(execFile);
export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_PDF_PAGES = 20;
const RENDER_DPI = 220;
const PROCESS_TIMEOUT_MS = 120_000;

export class PdfImportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function pageNumber(name) {
  const match = name.match(/-(\d+)\.png$/i);
  return Number(match?.[1] || 0);
}

/* OCR 한 줄에서 제목이 될 수 없는 장식을 걷어낸다.
   정규식 체인이 길어 회귀가 잘 보이지 않으므로 테스트에서 직접 확인한다. */
export function cleanLine(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+(?:(?:words?\s*(?:&|and)\s*music|lyrics?|arrang(?:ed|er))\b|작사|작곡|편곡|채보|번역).*$/i, '')
    .replace(/^\s*\d{1,4}[.)]?\s+(?=[가-힣A-Za-z])/, '')
    .replace(/[^가-힣A-Za-z0-9\s'’()/&.,!?+-]+/g, ' ')
    .replace(/^(?:[A-Za-z0-9]{1,3}\s+)+(?=[가-힣])/, '')
    .replace(/^[|_—–=+*#~·•.,:;]+|[|_—–=+*#~·•.,:;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* cleanLine 이 콜론을 지운 뒤에 검사되므로 'https //example.com' 형태도 함께 막는다.
   (콜론을 요구하는 패턴만 두면 악보 하단의 출처 URL 이 제목으로 뽑힌다.) */
const excludedTitle = /(https?\s*:?\s*\/\/|www\.|copyright|all rights|ccli|words?\s*(?:&|and)\s*music|lyrics?|arrang(?:ed|er)|작사|작곡|편곡|채보|번역|verse|chorus|bridge|intro|interlude|ending|bpm|tempo)/i;
const chordOnly = /^(?:[A-G](?:#|b)?(?:m|maj|min|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?[\s|:,.·-]*){2,}$/i;

function usableTitle(line) {
  if (line.length < 2 || line.length > 70 || excludedTitle.test(line) || chordOnly.test(line)) return false;
  if (/^(?:worship song|sheet music|악보)$/i.test(line)) return false;
  const letters = (line.match(/[가-힣A-Za-z]/g) || []).length;
  const hangul = (line.match(/[가-힣]/g) || []).length;
  const visible = line.replace(/\s/g, '').length;
  if (hangul >= 2 && /(?:^|\s)[A-Z]{1,5}(?:\s|$)/.test(line)) return false;
  return letters >= 2 && letters / Math.max(visible, 1) >= 0.65;
}

export function titleCandidate(text) {
  const candidates = String(text || '').split(/\r?\n/)
    .map(cleanLine)
    .filter(usableTitle);

  let best = '';
  let bestScore = -Infinity;
  candidates.slice(0, 18).forEach((line, index) => {
    const hangul = (line.match(/[가-힣]/g) || []).length;
    const letters = (line.match(/[가-힣A-Za-z]/g) || []).length;
    const noisy = (line.match(/[^가-힣A-Za-z0-9\s'’()\[\]/&.,!?+-]/g) || []).length;
    let score = 80 - (index * 4);
    if (hangul >= 2) score += 28;
    if (line.length >= 3 && line.length <= 34) score += 18;
    if (letters / Math.max(line.length, 1) >= 0.55) score += 12;
    if (noisy > 2) score -= noisy * 8;
    if (/^(제?\s*\d+장|page\s*\d+|\d+)$/i.test(line)) score -= 80;
    if (score > bestScore) {
      best = line;
      bestScore = score;
    }
  });
  return best.slice(0, 100);
}

function normalizeComparable(value) {
  return cleanLine(value).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[^가-힣a-z0-9]/g, '');
}

function editDistance(left, right) {
  if (!left) return right.length;
  if (!right) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function similarity(left, right) {
  const a = normalizeComparable(left);
  const b = normalizeComparable(right);
  if (!a || !b) return 0;
  return 1 - (editDistance(a, b) / Math.max(a.length, b.length));
}

export function matchKnownSongTitle(candidate, knownTitles = []) {
  const normalized = normalizeComparable(candidate);
  if (normalized.length < 2 || /^곡\d+$/.test(normalized)) return candidate;
  const scored = knownTitles
    .map(title => ({ title, normalized: normalizeComparable(title) }))
    .filter(item => item.normalized)
    .map(item => ({ ...item, score: similarity(normalized, item.normalized) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return candidate;
  if (best.normalized === normalized) return best.title;
  const distance = editDistance(normalized, best.normalized);
  const minimum = Math.max(normalized.length, best.normalized.length) <= 4 ? 0.84 : 0.72;
  const runnerUp = scored[1]?.score || 0;
  return best.score >= minimum && distance <= 2 && best.score - runnerUp >= 0.06 ? best.title : candidate;
}

function parseTsvLines(tsv, width, height, psm, plainText) {
  const rows = String(tsv || '').trim().split('\n').slice(1)
    .map(line => line.split('\t'))
    .filter(columns => columns.length >= 12 && columns[11].trim() && Number(columns[10]) >= 0);
  const groups = new Map();
  for (const columns of rows) {
    const key = columns.slice(1, 5).join('.');
    const group = groups.get(key) || [];
    group.push(columns);
    groups.set(key, group);
  }
  const plainLines = String(plainText || '').split(/\r?\n/).map(cleanLine).filter(usableTitle);
  return [...groups.values()].map(group => {
    group.sort((a, b) => Number(a[6]) - Number(b[6]));
    const original = group.map(columns => columns[11]).join(' ');
    const raw = cleanLine(original);
    const left = Math.min(...group.map(columns => Number(columns[6])));
    const top = Math.min(...group.map(columns => Number(columns[7])));
    const right = Math.max(...group.map(columns => Number(columns[6]) + Number(columns[8])));
    const bottom = Math.max(...group.map(columns => Number(columns[7]) + Number(columns[9])));
    const characterCount = group.reduce((sum, columns) => sum + columns[11].length, 0);
    const confidence = group.reduce((sum, columns) => sum + (Number(columns[10]) * columns[11].length), 0)
      / Math.max(characterCount, 1);
    const naturalLine = plainLines
      .map(line => ({ line, score: similarity(raw, line) }))
      .sort((a, b) => b.score - a.score)[0];
    // 줄 위치 결과와 일반 텍스트 결과가 거의 같은 경우에만 자연스러운 띄어쓰기를 가져온다.
    // 느슨하게 매칭하면 서로 다른 가사 줄이 제목 후보를 덮어쓰는 문제가 생긴다.
    const text = naturalLine?.score >= 0.95 ? naturalLine.line : raw;
    const lineHeight = bottom - top;
    const x = ((left + right) / 2) / width;
    const y = ((top + bottom) / 2) / height;
    return {
      text,
      confidence,
      psm,
      metadata: excludedTitle.test(original) || /(작사|작곡|편곡|채보|번역)/.test(original.replace(/\s/g, '')),
      score: (Math.min(lineHeight, 100) * 0.6) + (confidence * 0.8) - (y * 40) - (Math.abs(x - 0.5) * 45),
    };
  }).filter(candidate => !candidate.metadata && candidate.confidence >= 50 && candidate.score >= 62 && usableTitle(candidate.text));
}

async function runTitleOcr(cropPath, workDir, index, psm, width, height) {
  try {
    const [plainResult, tsvResult] = await Promise.all([
      run('tesseract', [cropPath, 'stdout', '-l', 'kor+eng', '--psm', String(psm), '--dpi', String(RENDER_DPI)], {
        timeout: 25_000,
        maxBuffer: 2 * 1024 * 1024,
      }),
      run('tesseract', [cropPath, 'stdout', '-l', 'kor+eng', '--psm', String(psm), '--dpi', String(RENDER_DPI), 'tsv'], {
        timeout: 25_000,
        maxBuffer: 4 * 1024 * 1024,
      }),
    ]);
    return parseTsvLines(tsvResult.stdout, width, height, psm, plainResult.stdout);
  } catch {
    return [];
  }
}

async function readEmbeddedText(pdfPath) {
  try {
    const { stdout } = await run('pdftotext', ['-layout', pdfPath, '-'], {
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout.split('\f');
  } catch {
    return [];
  }
}

async function ocrTitle(imagePath, workDir, index) {
  const metadata = await sharp(imagePath).metadata();
  if (!metadata.width || !metadata.height) return '';
  const cropPath = path.join(workDir, `title-${index}.png`);
  const cropHeight = Math.max(1, Math.round(metadata.height * 0.28));
  const { data: cropBuffer, info: cropInfo } = await sharp(imagePath)
    .extract({ left: 0, top: 0, width: metadata.width, height: cropHeight })
    // 스캔 악보는 지나치게 큰 상태보다 제목 폭을 정규화했을 때 한글 판독이 안정적이다.
    .resize({ width: 1000, withoutEnlargement: true })
    .greyscale()
    .normalize()
    .sharpen()
    .png({ compressionLevel: 7 })
    .toBuffer({ resolveWithObject: true });
  await writeFile(cropPath, cropBuffer, { mode: 0o600 });
  let candidates = [
    ...await runTitleOcr(cropPath, workDir, index, 6, cropInfo.width, cropInfo.height),
    ...await runTitleOcr(cropPath, workDir, index, 11, cropInfo.width, cropInfo.height),
  ].sort((a, b) => b.score - a.score);
  if (!candidates.length && metadata.width > cropInfo.width) {
    const fullCropPath = path.join(workDir, `title-full-${index}.png`);
    const { data: fullBuffer, info: fullInfo } = await sharp(imagePath)
      .extract({ left: 0, top: 0, width: metadata.width, height: cropHeight })
      .greyscale()
      .normalize()
      .sharpen()
      .png({ compressionLevel: 7 })
      .toBuffer({ resolveWithObject: true });
    await writeFile(fullCropPath, fullBuffer, { mode: 0o600 });
    candidates = [
      ...await runTitleOcr(fullCropPath, workDir, index, 6, fullInfo.width, fullInfo.height),
      ...await runTitleOcr(fullCropPath, workDir, index, 11, fullInfo.width, fullInfo.height),
    ].sort((a, b) => b.score - a.score);
  }
  if (process.env.DEBUG_PDF_OCR === '1') {
    console.error(`[pdf-ocr] page ${index}`, candidates.slice(0, 8));
  }
  return [...new Set(candidates.map(candidate => candidate.text?.slice(0, 100)).filter(Boolean))].slice(0, 8);
}

export async function extractPdfPages(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new PdfImportError('PDF 파일이 비어 있습니다.');
  if (buffer.length > MAX_PDF_BYTES) throw new PdfImportError('PDF는 25MB 이하여야 합니다.', 413);
  if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new PdfImportError('올바른 PDF 파일이 아닙니다.');

  const workDir = await mkdtemp(path.join(tmpdir(), 'chanyang-pdf-'));
  const pdfPath = path.join(workDir, 'input.pdf');
  try {
    await writeFile(pdfPath, buffer, { mode: 0o600 });
    let info;
    try {
      ({ stdout: info } = await run('pdfinfo', [pdfPath], { timeout: 15_000, maxBuffer: 1024 * 1024 }));
    } catch {
      throw new PdfImportError('PDF를 읽지 못했습니다. 암호 설정 또는 파일 손상 여부를 확인해 주세요.');
    }
    const count = Number(info.match(/^Pages:\s+(\d+)/mi)?.[1] || 0);
    if (!count) throw new PdfImportError('PDF에서 페이지를 찾지 못했습니다.');
    if (count > MAX_PDF_PAGES) throw new PdfImportError(`PDF는 한 번에 ${MAX_PDF_PAGES}페이지까지 등록할 수 있습니다.`);

    const embeddedPages = await readEmbeddedText(pdfPath);
    try {
      // 비정상적으로 큰 용지 크기가 들어 있는 PDF도 픽셀 폭증이 일어나지 않게 긴 변을 제한한다.
      await run('pdftoppm', ['-png', '-scale-to', '3000', '-f', '1', '-l', String(count), pdfPath, path.join(workDir, 'page')], {
        timeout: PROCESS_TIMEOUT_MS,
        maxBuffer: 2 * 1024 * 1024,
      });
    } catch (error) {
      if (error?.killed) throw new PdfImportError('PDF 변환 시간이 너무 오래 걸립니다. 파일을 나누어 다시 시도해 주세요.', 408);
      throw new PdfImportError('PDF 페이지를 악보 이미지로 변환하지 못했습니다.');
    }

    const names = (await readdir(workDir))
      .filter(name => /^page-\d+\.png$/i.test(name))
      .sort((a, b) => pageNumber(a) - pageNumber(b));
    if (names.length !== count) throw new PdfImportError('PDF의 일부 페이지를 변환하지 못했습니다.');

    const pages = [];
    for (let index = 0; index < names.length; index += 1) {
      const imagePath = path.join(workDir, names[index]);
      const embeddedTitle = titleCandidate(embeddedPages[index] || '');
      // 스캐너가 만든 PDF에는 눈에 보이는 글자와 전혀 다른 부정확한 숨은 OCR 층이
      // 포함되기도 한다. 실제 렌더링 화면을 읽은 결과를 우선하고, 숨은 글자는 보조로만 쓴다.
      const visualTitles = await ocrTitle(imagePath, workDir, index + 1);
      const titleCandidates = [...new Set([...visualTitles, embeddedTitle].filter(Boolean))];
      const title = titleCandidates[0] || `곡 ${index + 1}`;
      const imageBuffer = await readFile(imagePath);
      pages.push({ buffer: imageBuffer, title, titleCandidates });
    }
    return pages;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
