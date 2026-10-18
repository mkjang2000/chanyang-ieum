import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import fontkit from '@pdf-lib/fontkit';
import { Font } from 'fonteditor-core';
import { PDFDocument, rgb } from 'pdf-lib';
import sharp from 'sharp';
import { getPool } from './db.js';
import { getStoredImage } from './images.js';

const A4 = [595.28, 841.89];
const FONT_PATH = new URL(
  '../../node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff',
  import.meta.url,
);
let pdfFontBytes;

async function getPdfFontBytes() {
  if (!pdfFontBytes) {
    pdfFontBytes = readFile(FONT_PATH).then(buffer => {
      // pdf-lib/fontkit의 WOFF 부분 임베딩은 CJK 복합 글리프를 일부 잃는다.
      // 같은 폰트를 TrueType으로 풀어 준 뒤 subset 해야 한글·영문이 모두 보존된다.
      const source = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      const inflate = compressed => Array.from(inflateSync(Buffer.from(compressed)));
      return Font.create(source, { type: 'woff', inflate }).write({ type: 'ttf' });
    });
  }
  return pdfFontBytes;
}

export class ExportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function getContiForExport(id, connection = getPool()) {
  const [contiRows] = await connection.query(
    `SELECT id, DATE_FORMAT(worship_date, '%Y-%m-%d') AS date,
            TIME_FORMAT(worship_time, '%H:%i') AS time,
            title, leader, memo
       FROM contis
      WHERE id = ?
      LIMIT 1`,
    [id],
  );
  if (!contiRows.length) return null;
  const [pages] = await connection.query(
    `SELECT ci.id, ci.image_id AS imageId, ci.position, ci.title,
            COALESCE(NULLIF(ci.key_name, ''), i.key_name) AS \`key\`,
            ci.memo, ci.start_instrument AS startInstrument,
            ip.name AS startInstrumentLabel,
            ci.transition_mode AS transitionMode, ci.bpm, ci.time_signature AS timeSignature,
            i.mime_type AS mime, i.file_size AS fileSize
       FROM conti_items ci
       JOIN images i ON i.id = ci.image_id
       LEFT JOIN instrument_presets ip ON ip.id = ci.start_instrument
      WHERE ci.conti_id = ?
      ORDER BY ci.position`,
    [id],
  );
  return { ...contiRows[0], pages };
}

const cleanPart = (value, fallback) => {
  const clean = String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  return (clean || fallback).slice(0, 80);
};

export function contiFilename(conti, suffix = '', extension = 'pdf') {
  const parts = [
    cleanPart(conti.date, '날짜미정'),
    cleanPart(conti.title, '콘티'),
    cleanPart(conti.leader, '인도자미정'),
  ];
  if (suffix) parts.push(cleanPart(suffix, '악보'));
  return `${parts.join('_')}.${extension}`;
}

export function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

const mimeExtension = mime => ({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}[String(mime).toLowerCase()] || 'img');

export async function getContiImageDownload(contiId, itemId) {
  const conti = await getContiForExport(contiId);
  if (!conti) throw new ExportError('콘티를 찾을 수 없습니다.', 404);
  const index = conti.pages.findIndex(page => page.id === itemId);
  if (index < 0) throw new ExportError('악보를 찾을 수 없습니다.', 404);
  const page = conti.pages[index];
  const image = await getStoredImage(page.imageId);
  if (!image) throw new ExportError('저장된 악보 파일을 찾을 수 없습니다.', 404);
  const suffix = `${String(index + 1).padStart(2, '0')}_${page.title || `곡 ${index + 1}`}`;
  return {
    ...image,
    filename: contiFilename(conti, suffix, mimeExtension(image.mime)),
  };
}

function wrapText(text, font, size, maxWidth, maxLines) {
  const source = String(text || '').replace(/\r/g, '').trim();
  if (!source) return [];
  const lines = [];
  for (const paragraph of source.split('\n')) {
    let line = '';
    const tokens = paragraph.match(/\S+\s*|\s+/g) || [];
    for (const token of tokens) {
      const candidate = line + token;
      if (!line || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      lines.push(line.trimEnd());
      line = token.trimStart();
      while (line && font.widthOfTextAtSize(line, size) > maxWidth) {
        let cut = 1;
        while (cut < line.length && font.widthOfTextAtSize(line.slice(0, cut + 1), size) <= maxWidth) cut += 1;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
      if (lines.length >= maxLines) break;
    }
    if (lines.length >= maxLines) break;
    if (line) lines.push(line.trimEnd());
  }
  if (lines.length > maxLines) lines.length = maxLines;
  if (lines.length === maxLines && source.length > lines.join('').length) {
    let last = lines[maxLines - 1];
    while (last && font.widthOfTextAtSize(`${last}…`, size) > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

function fitText(text, font, size, maxWidth) {
  const source = String(text || '');
  if (font.widthOfTextAtSize(source, size) <= maxWidth) return source;
  let fitted = source;
  while (fitted && font.widthOfTextAtSize(`${fitted}…`, size) > maxWidth) fitted = fitted.slice(0, -1);
  return `${fitted}…`;
}

async function embedSheet(pdf, image) {
  const mime = String(image.mime || '').toLowerCase();
  if (mime === 'image/jpeg') return pdf.embedJpg(image.buffer);
  if (mime === 'image/png') return pdf.embedPng(image.buffer);
  const converted = await sharp(image.buffer, { animated: false })
    .rotate()
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toBuffer();
  return pdf.embedJpg(converted);
}

export async function createContiPdf(conti) {
  if (!conti?.pages?.length) throw new ExportError('PDF로 만들 악보가 없습니다.', 400);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontBytes = await getPdfFontBytes();
  const font = await pdf.embedFont(fontBytes, { subset: true });
  pdf.setTitle(conti.title || '콘티');
  pdf.setAuthor(conti.leader || '');
  pdf.setCreator('찬양이음');

  for (let index = 0; index < conti.pages.length; index += 1) {
    const item = conti.pages[index];
    const stored = await getStoredImage(item.imageId);
    if (!stored) throw new ExportError(`${index + 1}번 악보 파일을 찾을 수 없습니다.`, 404);
    const embedded = await embedSheet(pdf, stored);
    const page = pdf.addPage(A4);
    const [width, height] = A4;
    const margin = 30;
    const contentWidth = width - margin * 2;
    const titleSize = 15;
    const metaSize = 8.5;
    const title = fitText(item.title || `곡 ${index + 1}`, font, titleSize, contentWidth * 0.57);
    const meta = fitText([
      conti.date,
      conti.time,
      conti.leader ? `인도 ${conti.leader}` : '',
      item.key ? `${item.key} Key` : '',
      item.startInstrument ? `${item.startInstrumentLabel || item.startInstrument} 시작` : '',
      item.transitionMode === 'stop' ? '끊고' : item.transitionMode === 'continue' ? '이어서' : '',
    ].filter(Boolean).join(' · '), font, metaSize, contentWidth * 0.4);

    page.drawText(title, { x: margin, y: height - 39, size: titleSize, font, color: rgb(0.08, 0.1, 0.09) });
    if (meta) {
      const metaWidth = font.widthOfTextAtSize(meta, metaSize);
      page.drawText(meta, {
        x: Math.max(margin, width - margin - metaWidth),
        y: height - 38,
        size: metaSize,
        font,
        color: rgb(0.33, 0.37, 0.35),
      });
    }
    page.drawLine({
      start: { x: margin, y: height - 52 },
      end: { x: width - margin, y: height - 52 },
      thickness: 0.7,
      color: rgb(0.78, 0.8, 0.79),
    });

    const noteText = [
      item.memo?.trim() ? `곡 메모  ${item.memo.trim()}` : '',
      conti.memo?.trim() ? `콘티 메모  ${conti.memo.trim()}` : '',
    ].filter(Boolean).join('\n');
    const noteLines = wrapText(noteText, font, 8.5, contentWidth - 14, 5);
    const noteHeight = noteLines.length ? Math.max(38, noteLines.length * 12 + 15) : 0;
    const imageTop = height - 62;
    const imageBottom = margin + noteHeight;
    const availableHeight = imageTop - imageBottom;
    const scale = Math.min(contentWidth / embedded.width, availableHeight / embedded.height);
    const imageWidth = embedded.width * scale;
    const imageHeight = embedded.height * scale;
    page.drawImage(embedded, {
      x: (width - imageWidth) / 2,
      y: imageBottom + (availableHeight - imageHeight) / 2,
      width: imageWidth,
      height: imageHeight,
    });

    if (noteLines.length) {
      page.drawRectangle({
        x: margin,
        y: margin,
        width: contentWidth,
        height: noteHeight - 5,
        color: rgb(0.965, 0.97, 0.965),
        borderColor: rgb(0.86, 0.88, 0.87),
        borderWidth: 0.6,
      });
      noteLines.forEach((line, lineIndex) => {
        page.drawText(line, {
          x: margin + 7,
          y: margin + noteHeight - 18 - lineIndex * 12,
          size: 8.5,
          font,
          color: rgb(0.2, 0.23, 0.21),
        });
      });
    }
    page.drawText(`${index + 1} / ${conti.pages.length}`, {
      x: width - margin - 22,
      y: 12,
      size: 7,
      font,
      color: rgb(0.48, 0.5, 0.49),
    });
  }
  return Buffer.from(await pdf.save());
}
