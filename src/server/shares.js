import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuthError } from './auth.js';
import { getPool } from './db.js';
import { getContiForExport } from './exports.js';

export const SHARE_ROLES = ['admin', 'leader', 'accompanist'];
const MAX_SHARE_DAYS = 365;
const tokenHash = token => createHash('sha256').update(String(token || '')).digest('hex');

export class ShareError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const publicShare = (row, actor) => ({
  id: row.id,
  contiId: row.contiId,
  creatorId: row.creatorId,
  creatorName: row.creatorName,
  contiTitle: row.contiTitle || '',
  worshipDate: row.worshipDate || '',
  leader: row.leader || '',
  expiresAt: row.expiresAt,
  revokedAt: row.revokedAt,
  createdAt: row.createdAt,
  lastAccessedAt: row.lastAccessedAt,
  accessCount: Number(row.accessCount || 0),
  active: !row.revokedAt && new Date(row.expiresAt).getTime() > Date.now(),
  canRevoke: actor.role === 'admin' || actor.id === row.creatorId,
});

export async function listAllShareLinks(actor) {
  const [rows] = await getPool().query(
    `SELECT sl.id, sl.conti_id AS contiId, sl.created_by AS creatorId,
            u.display_name AS creatorName, c.title AS contiTitle,
            DATE_FORMAT(c.worship_date, '%Y-%m-%d') AS worshipDate, c.leader,
            DATE_FORMAT(sl.expires_at, '%Y-%m-%dT%H:%i:%s') AS expiresAt,
            DATE_FORMAT(sl.revoked_at, '%Y-%m-%dT%H:%i:%s') AS revokedAt,
            DATE_FORMAT(sl.created_at, '%Y-%m-%dT%H:%i:%s') AS createdAt,
            DATE_FORMAT(sl.last_accessed_at, '%Y-%m-%dT%H:%i:%s') AS lastAccessedAt,
            sl.access_count AS accessCount
       FROM share_links sl
       JOIN users u ON u.id = sl.created_by
       JOIN contis c ON c.id = sl.conti_id
      ORDER BY sl.created_at DESC`,
  );
  return rows.map(row => publicShare(row, actor));
}

export async function listShareLinks(actor, contiId) {
  const [rows] = await getPool().query(
    `SELECT sl.id, sl.conti_id AS contiId, sl.created_by AS creatorId,
            u.display_name AS creatorName,
            DATE_FORMAT(sl.expires_at, '%Y-%m-%dT%H:%i:%s') AS expiresAt,
            DATE_FORMAT(sl.revoked_at, '%Y-%m-%dT%H:%i:%s') AS revokedAt,
            DATE_FORMAT(sl.created_at, '%Y-%m-%dT%H:%i:%s') AS createdAt,
            DATE_FORMAT(sl.last_accessed_at, '%Y-%m-%dT%H:%i:%s') AS lastAccessedAt,
            sl.access_count AS accessCount
       FROM share_links sl
       JOIN users u ON u.id = sl.created_by
      WHERE sl.conti_id = ?
      ORDER BY sl.created_at DESC`,
    [contiId],
  );
  return rows.map(row => publicShare(row, actor));
}

export async function createShareLink(actor, contiId, expiresAt) {
  const expiry = new Date(expiresAt);
  const now = Date.now();
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= now + 60_000) {
    throw new AuthError('공유 링크 만료 시간을 현재보다 뒤로 지정해 주세요.', 400);
  }
  if (expiry.getTime() > now + MAX_SHARE_DAYS * 86400_000) {
    throw new AuthError(`공유 링크는 최대 ${MAX_SHARE_DAYS}일까지 만들 수 있습니다.`, 400);
  }
  const conti = await getContiForExport(contiId);
  if (!conti) throw new AuthError('공유할 콘티를 찾을 수 없습니다.', 404);
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  await getPool().query(
    `INSERT INTO share_links (id, conti_id, token_hash, created_by, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, contiId, tokenHash(token), actor.id, expiry],
  );
  const [created] = await listShareLinks(actor, contiId);
  return { ...created, token };
}

export async function revokeShareLink(actor, id) {
  const [rows] = await getPool().query(
    'SELECT id, created_by AS creatorId FROM share_links WHERE id = ? LIMIT 1',
    [id],
  );
  if (!rows.length) throw new AuthError('공유 링크를 찾을 수 없습니다.', 404);
  if (actor.role !== 'admin' && actor.id !== rows[0].creatorId) {
    throw new AuthError('관리자 또는 링크를 만든 사용자만 폐기할 수 있습니다.', 403);
  }
  await getPool().query(
    'UPDATE share_links SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP(3)) WHERE id = ?',
    [id],
  );
  return true;
}

export async function getValidShare(token, { touch = false } = {}) {
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(String(token || ''))) {
    throw new ShareError('유효하지 않은 공유 링크입니다.', 404);
  }
  const [rows] = await getPool().query(
    `SELECT sl.id, sl.conti_id AS contiId,
            DATE_FORMAT(sl.expires_at, '%Y-%m-%dT%H:%i:%s') AS expiresAt,
            sl.revoked_at AS revokedAt
       FROM share_links sl
      WHERE sl.token_hash = ?
      LIMIT 1`,
    [tokenHash(token)],
  );
  const share = rows[0];
  if (!share) throw new ShareError('유효하지 않은 공유 링크입니다.', 404);
  if (share.revokedAt) throw new ShareError('폐기된 공유 링크입니다.', 410);
  if (new Date(share.expiresAt).getTime() <= Date.now()) throw new ShareError('만료된 공유 링크입니다.', 410);
  if (touch) {
    await getPool().query(
      `UPDATE share_links
          SET last_accessed_at = CURRENT_TIMESTAMP(3), access_count = access_count + 1
        WHERE id = ?`,
      [share.id],
    );
  }
  return share;
}

export async function getSharedConti(token, options) {
  const share = await getValidShare(token, options);
  const conti = await getContiForExport(share.contiId);
  if (!conti) throw new ShareError('공유된 콘티를 찾을 수 없습니다.', 404);
  return { share, conti };
}

export function shareErrorResponse(error, fallback = '공유 링크를 열지 못했어요.') {
  const status = error instanceof ShareError ? error.status : 500;
  if (status === 500) console.error(fallback, error);
  return Response.json({ message: status === 500 ? fallback : error.message }, { status });
}
