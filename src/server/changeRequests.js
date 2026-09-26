import { randomUUID } from 'node:crypto';
import { AuthError } from './auth.js';
import { getPool, withTransaction } from './db.js';
import { prepareImage, persistPreparedImage } from './images.js';

export function assertRequestAccess(conti, actor, manage = false) {
  if (!conti) throw new AuthError('콘티를 찾을 수 없습니다.', 404);
  if (actor.role === 'admin' || (actor.role === 'leader' && conti.ownerUserId === actor.id)) return;
  if (!manage && actor.role === 'accompanist') return;
  throw new AuthError('이 변경 요청을 처리할 권한이 없습니다.', 403);
}

export function isRequestStale(request, item) {
  return !item || item.imageId !== request.beforeImageId
    || item.key !== request.beforeKey || item.contiKey !== request.beforeContiKey
    || item.title !== request.title;
}

export function assertRequestAction(request, conti, actor, action, item) {
  assertRequestAccess(conti, actor);
  if (!['approve', 'reject', 'cancel'].includes(action)) throw new AuthError('지원하지 않는 처리입니다.', 400);
  if (action === 'cancel') {
    if (actor.role !== 'accompanist' || request.requesterId !== actor.id) {
      throw new AuthError('본인의 요청만 취소할 수 있습니다.', 403);
    }
  } else assertRequestAccess(conti, actor, true);
  if (request.status !== 'pending') throw new AuthError('이미 처리된 요청입니다. 내역을 다시 확인해 주세요.', 409);
  if (action === 'approve' && isRequestStale(request, item)) {
    throw new AuthError('요청 이후 원본 악보 또는 Key가 변경되었거나 곡이 삭제됐어요. 반려 후 최신 악보로 다시 요청해 주세요.', 409);
  }
}

async function loadConti(id, connection = getPool(), lock = false) {
  const [rows] = await connection.query(`SELECT id, owner_user_id AS ownerUserId FROM contis WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [id]);
  return rows[0];
}

async function loadItem(contiId, itemId, connection) {
  const [rows] = await connection.query(
    `SELECT ci.id, ci.title, ci.song_id AS songId, ci.image_id AS imageId,
            ci.key_name AS contiKey, COALESCE(NULLIF(ci.key_name, ''), i.key_name) AS \`key\`
       FROM conti_items ci JOIN images i ON i.id = ci.image_id
      WHERE ci.conti_id = ? AND ci.id = ?`, [contiId, itemId]);
  return rows[0];
}

export async function listChangeRequests(contiId, actor) {
  assertRequestAccess(await loadConti(contiId), actor);
  const [rows] = await getPool().query(
    `SELECT cr.id, cr.item_id AS itemId, cr.requester_id AS requesterId,
            cr.requester_name AS requesterName, cr.title,
            cr.before_image_id AS beforeImageId, cr.before_key AS beforeKey,
            cr.before_conti_key AS beforeContiKey,
            cr.proposed_image_id AS proposedImageId, cr.proposed_key AS proposedKey,
            cr.reason, cr.status, cr.reviewer_name AS reviewerName, cr.review_reason AS reviewReason,
            DATE_FORMAT(cr.created_at, '%Y-%m-%d %H:%i') AS createdAt,
            DATE_FORMAT(cr.reviewed_at, '%Y-%m-%d %H:%i') AS reviewedAt,
            ci.image_id AS currentImageId, ci.title AS currentTitle, ci.key_name AS currentContiKey,
            COALESCE(NULLIF(ci.key_name, ''), i.key_name) AS currentKey
       FROM conti_change_requests cr
       LEFT JOIN conti_items ci ON ci.id = cr.item_id AND ci.conti_id = cr.conti_id
       LEFT JOIN images i ON i.id = ci.image_id
      WHERE cr.conti_id = ? ${actor.role === 'accompanist' ? 'AND cr.requester_id = ?' : ''}
      ORDER BY COALESCE(cr.reviewed_at, cr.created_at) DESC, cr.id DESC`,
    actor.role === 'accompanist' ? [contiId, actor.id] : [contiId]);
  return rows.map(({ currentImageId, currentTitle, currentContiKey, currentKey, ...row }) => ({
    ...row,
    beforeImage: `/api/images?id=${encodeURIComponent(row.beforeImageId)}`,
    proposedImage: `/api/images?id=${encodeURIComponent(row.proposedImageId)}`,
    stale: row.status === 'pending' && isRequestStale(row, currentImageId ? {
      imageId: currentImageId, key: currentKey, contiKey: currentContiKey, title: currentTitle,
    } : null),
  }));
}

export async function createChangeRequest(input, actor) {
  if (actor.role !== 'accompanist') throw new AuthError('반주자만 변경을 신청할 수 있습니다.', 403);
  const { contiId, itemId } = input;
  if (!contiId || !itemId || !input.beforeImageId || typeof input.beforeKey !== 'string'
      || typeof input.beforeContiKey !== 'string' || typeof input.title !== 'string') {
    throw new AuthError('변경할 곡을 다시 선택해 주세요.', 400);
  }
  const key = String(input.key || '').trim();
  const reason = String(input.reason || '').trim();
  if (!key) throw new AuthError('요청할 Key를 입력해 주세요.', 400);
  if (key.length > 32 || reason.length > 2000) throw new AuthError('Key는 32자, 요청 사유는 2,000자 이내로 입력해 주세요.', 400);
  assertRequestAccess(await loadConti(contiId), actor);
  const item = await loadItem(contiId, itemId, getPool());
  if (isRequestStale(input, item)) throw new AuthError('원본이 변경됐어요. 콘티를 다시 열고 요청해 주세요.', 409);
  let imageId;
  try {
    imageId = await persistPreparedImage(await prepareImage(input));
  } catch (error) {
    throw new AuthError(`악보 이미지를 저장하지 못했어요. ${error.message}`, 400);
  }
  return withTransaction(async connection => {
    assertRequestAccess(await loadConti(contiId, connection, true), actor);
    const current = await loadItem(contiId, itemId, connection);
    if (isRequestStale(input, current)) throw new AuthError('원본이 변경됐어요. 콘티를 다시 열고 요청해 주세요.', 409);
    if (imageId === current.imageId && key === current.key) throw new AuthError('Key 또는 악보 이미지를 변경해 주세요.', 400);
    const [pending] = await connection.query(
      "SELECT id FROM conti_change_requests WHERE conti_id = ? AND item_id = ? AND requester_id = ? AND status = 'pending'",
      [contiId, itemId, actor.id]);
    if (pending.length) throw new AuthError('이 곡에 승인 대기 중인 요청이 있어요. 이력확인에서 확인하거나 취소해 주세요.', 409);
    const id = randomUUID();
    await connection.query(
      `INSERT INTO conti_change_requests
        (id, conti_id, item_id, requester_id, requester_name, title, before_image_id,
         before_key, before_conti_key, proposed_image_id, proposed_key, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, contiId, itemId, actor.id, actor.displayName, current.title, current.imageId,
        current.key, current.contiKey, imageId, key, reason]);
    return { id };
  });
}

export async function reviewChangeRequest(input, actor) {
  const { contiId, id, action } = input;
  if (!contiId || !id) throw new AuthError('변경 요청을 선택해 주세요.', 400);
  const reviewReason = String(input.reviewReason || '').trim();
  if (reviewReason.length > 2000) throw new AuthError('반려 사유는 2,000자 이내로 입력해 주세요.', 400);
  return withTransaction(async connection => {
    // 콘티 저장과 모든 요청 처리는 같은 콘티 행을 먼저 잠근다.
    const conti = await loadConti(contiId, connection, true);
    assertRequestAccess(conti, actor);
    const [rows] = await connection.query(
      `SELECT id, item_id AS itemId, requester_id AS requesterId, title, status,
              before_image_id AS beforeImageId, before_key AS beforeKey,
              before_conti_key AS beforeContiKey,
              proposed_image_id AS proposedImageId, proposed_key AS proposedKey
         FROM conti_change_requests WHERE id = ? AND conti_id = ? FOR UPDATE`, [id, contiId]);
    const request = rows[0];
    if (!request) throw new AuthError('변경 요청을 찾을 수 없습니다.', 404);
    const item = await loadItem(contiId, request.itemId, connection);
    assertRequestAction(request, conti, actor, action, item);
    if (action === 'approve') {
      await connection.query('UPDATE conti_items SET image_id = ?, key_name = ? WHERE id = ? AND conti_id = ?',
        [request.proposedImageId, request.proposedKey, request.itemId, contiId]);
      if (item.songId) await connection.query(
        `INSERT INTO song_images (song_id, image_id, use_count, last_used_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP(3)`,
        [item.songId, request.proposedImageId]);
      await connection.query('UPDATE contis SET updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [contiId]);
    }
    const status = { approve: 'approved', reject: 'rejected', cancel: 'cancelled' }[action];
    await connection.query(
      `UPDATE conti_change_requests SET status = ?, reviewer_name = ?, review_reason = ?, reviewed_at = CURRENT_TIMESTAMP(3)
        WHERE id = ?`, [status, actor.displayName, action === 'reject' ? reviewReason : '', id]);
    return { id, status };
  });
}
