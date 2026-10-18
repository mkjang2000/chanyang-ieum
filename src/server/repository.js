import { normalizeTempo } from '../metronome.js';
import { getPool, normalizeSongTitle, withTransaction } from './db.js';
import { persistPreparedImage, prepareImage } from './images.js';
import { AuthError } from './auth.js';
import { assertServicePresetExists, listServicePresets } from './presets.js';
import { listFlowSignals } from './flowSignals.js';
import { assertInstrumentPresetsExist, getInstrumentPreset, listInstrumentPresets } from './instruments.js';

const imageUrl = id => `/api/images?id=${encodeURIComponent(id)}`;
const viewerImageUrl = id => `${imageUrl(id)}&variant=viewer`;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export async function listEvents(connection = getPool()) {
  const [rows] = await connection.query(
    `SELECT id, title, DATE_FORMAT(start_date, '%Y-%m-%d') AS start,
            DATE_FORMAT(end_date, '%Y-%m-%d') AS end, color
       FROM events
      ORDER BY start_date, title`,
  );
  return rows;
}

export async function listContis(connection = getPool()) {
  const [contiRows] = await connection.query(
    `SELECT id, owner_user_id AS ownerUserId, mode, event_id AS eventId,
            DATE_FORMAT(worship_date, '%Y-%m-%d') AS date,
            TIME_FORMAT(worship_time, '%H:%i') AS time,
            service_type AS serviceType, title, leader, memo, archived,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS updatedAt
       FROM contis
      ORDER BY worship_date, worship_time IS NULL, worship_time, created_at`,
  );
  if (!contiRows.length) return [];
  const [itemRows] = await connection.query(
    // 콘티에 적어 둔 Key 가 없으면 악보 자체의 Key(자동 인식 포함)를 쓴다.
    // 콘티를 저장한 뒤에 인식이 끝나는 경우가 있어, 조회 시점에 메워 준다.
    `SELECT ci.id, ci.conti_id AS contiId, ci.song_id AS songId, ci.image_id AS imageId,
            ci.position, ci.title,
            COALESCE(NULLIF(ci.key_name, ''), i.key_name) AS \`key\`,
            ci.key_name AS contiKey, i.key_name AS imageKey, i.key_source AS keySource,
            ci.memo, ci.start_instrument AS startInstrument,
            ip.name AS startInstrumentLabel,
            ci.transition_mode AS transitionMode, ci.bpm, ci.time_signature AS timeSignature,
            i.width, i.height, i.source_url AS sourceUrl, i.source_type AS sourceType
       FROM conti_items ci
       JOIN images i ON i.id = ci.image_id
       LEFT JOIN instrument_presets ip ON ip.id = ci.start_instrument
      ORDER BY ci.conti_id, ci.position`,
  );
  const pagesByConti = new Map();
  for (const item of itemRows) {
    const pages = pagesByConti.get(item.contiId) || [];
    pages.push({ ...item, image: viewerImageUrl(item.imageId) });
    pagesByConti.set(item.contiId, pages);
  }
  return contiRows.map(row => ({
    ...row,
    archived: Boolean(row.archived),
    pages: pagesByConti.get(row.id) || [],
  }));
}

export async function listSongs(connection = getPool()) {
  const [rows] = await connection.query(
    `SELECT s.id, s.title, s.normalized_title AS normalizedTitle,
            COUNT(DISTINCT ci.conti_id) AS contiCount,
            COUNT(DISTINCT si.image_id) AS imageCount,
            MAX(c.worship_date) AS lastUsedDate,
            SUBSTRING_INDEX(GROUP_CONCAT(si.image_id ORDER BY si.last_used_at DESC), ',', 1) AS imageId
       FROM songs s
       LEFT JOIN conti_items ci ON ci.song_id = s.id
       LEFT JOIN contis c ON c.id = ci.conti_id
       LEFT JOIN song_images si ON si.song_id = s.id
      GROUP BY s.id
      ORDER BY contiCount DESC, lastUsedDate DESC, s.title`,
  );
  return rows.map(row => ({
    ...row,
    contiCount: Number(row.contiCount),
    imageCount: Number(row.imageCount),
    image: row.imageId ? imageUrl(row.imageId) : null,
  }));
}

export async function listLeaderOptions(connection = getPool()) {
  const [rows] = await connection.query(
    `SELECT id, username, display_name AS displayName, role
       FROM users
      WHERE active = 1 AND role IN ('admin', 'leader')
      ORDER BY (role = 'admin') DESC, display_name`,
  );
  return rows;
}

export async function getSongDetails(id, connection = getPool()) {
  const [songRows] = await connection.query(
    `SELECT s.id, s.title, s.normalized_title AS normalizedTitle,
            COUNT(DISTINCT ci.conti_id) AS contiCount,
            MAX(c.worship_date) AS lastUsedDate
       FROM songs s
       LEFT JOIN conti_items ci ON ci.song_id = s.id
       LEFT JOIN contis c ON c.id = ci.conti_id
      WHERE s.id = ?
      GROUP BY s.id`,
    [id],
  );
  if (!songRows.length) return null;
  const [images] = await connection.query(
    `SELECT i.id AS imageId, i.width, i.height, i.source_type AS sourceType,
            i.source_url AS sourceUrl, i.key_name AS keyName, i.key_source AS keySource,
            si.use_count AS useCount,
            DATE_FORMAT(si.last_used_at, '%Y-%m-%d %H:%i') AS lastUsedAt
       FROM song_images si
       JOIN images i ON i.id = si.image_id
      WHERE si.song_id = ?
      ORDER BY si.last_used_at DESC, si.use_count DESC`,
    [id],
  );
  return {
    ...songRows[0],
    contiCount: Number(songRows[0].contiCount),
    images: images.map(image => ({
      ...image,
      useCount: Number(image.useCount),
      image: imageUrl(image.imageId),
      // 악보에 붙어 있는 Key. 재사용 시 콘티로 함께 넘어간다.
      key: image.keyName || '',
      keySource: image.keySource || '',
    })),
  };
}

export async function getBootstrapData() {
  const [events, contis, songs, leaderOptions, servicePresets, flowSignals, instrumentPresets] = await Promise.all([
    listEvents(), listContis(), listSongs(), listLeaderOptions(), listServicePresets(), listFlowSignals(), listInstrumentPresets(),
  ]);
  return { events, contis, songs, leaderOptions, servicePresets, flowSignals, instrumentPresets };
}

export async function upsertEvent(event) {
  if (!event?.id || !event.title?.trim() || !event.start || !event.end || event.end < event.start) {
    throw new Error('행사 정보를 확인해 주세요.');
  }
  await getPool().query(
    `INSERT INTO events (id, title, start_date, end_date, color)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title = VALUES(title), start_date = VALUES(start_date),
       end_date = VALUES(end_date), color = VALUES(color)`,
    [String(event.id).slice(0, 64), event.title.trim().slice(0, 255), event.start, event.end, event.color || '#d9a441'],
  );
  const events = await listEvents();
  return events.find(item => item.id === String(event.id));
}

export async function deleteEvent(id) {
  const [result] = await getPool().query('DELETE FROM events WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function upsertSong(connection, title) {
  const cleanTitle = title.trim().slice(0, 255);
  const normalized = normalizeSongTitle(cleanTitle);
  if (!normalized) return null;
  await connection.query(
    `INSERT INTO songs (title, normalized_title) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), title = VALUES(title)`,
    [cleanTitle, normalized],
  );
  const [rows] = await connection.query('SELECT id FROM songs WHERE normalized_title = ? LIMIT 1', [normalized]);
  return rows[0]?.id || null;
}

async function findContiOwnership(id, connection = getPool(), lock = false) {
  const [rows] = await connection.query(
    `SELECT id, owner_user_id AS ownerUserId, leader
       FROM contis WHERE id = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0] || null;
}

/* 콘티 수정·삭제 권한. 여기가 느슨해지면 남의 콘티를 지울 수 있게 되므로 테스트로 고정한다. */
export function assertContiOwner(conti, actor) {
  if (actor.role === 'admin') return;
  if (conti?.ownerUserId === actor.id) return;
  throw new AuthError('본인이 인도하는 콘티만 수정하거나 삭제할 수 있습니다.', 403);
}

export async function assertCanManageConti(id, actor, connection = getPool()) {
  const conti = await findContiOwnership(id, connection);
  if (!conti) throw new AuthError('콘티를 찾을 수 없습니다.', 404);
  assertContiOwner(conti, actor);
  return conti;
}

async function resolveContiLeader(conti, actor, connection = getPool()) {
  if (actor.role !== 'admin') {
    return { leader: actor.displayName, ownerUserId: actor.id };
  }

  const requestedOwnerId = String(conti.ownerUserId || '');
  if (requestedOwnerId) {
    const [rows] = await connection.query(
      `SELECT id, display_name AS displayName
         FROM users
        WHERE id = ? AND active = 1 AND role IN ('admin', 'leader')
        LIMIT 1`,
      [requestedOwnerId],
    );
    if (!rows.length) throw new AuthError('선택한 인도자 계정을 사용할 수 없습니다.', 400);
    return { leader: rows[0].displayName, ownerUserId: rows[0].id };
  }

  const leader = String(conti.leader || '').trim().slice(0, 255);
  if (leader) {
    const [matches] = await connection.query(
      `SELECT id, display_name AS displayName
         FROM users
        WHERE display_name = ? AND active = 1 AND role IN ('admin', 'leader')
        LIMIT 2`,
      [leader],
    );
    if (matches.length === 1) return { leader: matches[0].displayName, ownerUserId: matches[0].id };
  }
  return { leader: leader || actor.displayName, ownerUserId: actor.id };
}

export async function saveConti(conti, actor) {
  if (!conti?.id || !conti.title?.trim() || !conti.date || !Array.isArray(conti.pages) || !conti.pages.length) {
    throw new Error('콘티 정보와 악보 이미지를 확인해 주세요.');
  }
  if (!['regular', 'event'].includes(conti.mode)) throw new Error('지원하지 않는 콘티 종류입니다.');
  if (conti.mode === 'event' && !conti.eventId) throw new Error('행사 콘티에는 행사가 필요합니다.');
  if (conti.mode === 'regular') await assertServicePresetExists(String(conti.serviceType || ''));
  await assertInstrumentPresetsExist(conti.pages.map(page => page.startInstrument));

  let tempos;
  try { tempos = conti.pages.map(normalizeTempo); } catch (error) { throw new AuthError(error.message, 400); }
  const contiId = String(conti.id).slice(0, 64);
  const existing = await findContiOwnership(contiId);
  if (existing) assertContiOwner(existing, actor);
  const ownership = await resolveContiLeader(conti, actor);

  const prepared = await Promise.all(conti.pages.map(prepareImage));
  const imageIds = await Promise.all(prepared.map(persistPreparedImage));

  await withTransaction(async connection => {
    const current = await findContiOwnership(contiId, connection, true);
    if (current) assertContiOwner(current, actor);
    await connection.query(
      `INSERT INTO contis
        (id, owner_user_id, mode, event_id, worship_date, worship_time, service_type, title, leader, memo, archived)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE owner_user_id = VALUES(owner_user_id),
         mode = VALUES(mode), event_id = VALUES(event_id),
         worship_date = VALUES(worship_date), worship_time = VALUES(worship_time),
         service_type = VALUES(service_type),
         title = VALUES(title), leader = VALUES(leader), memo = VALUES(memo),
         archived = VALUES(archived)`,
      [
        contiId,
        ownership.ownerUserId,
        conti.mode,
        conti.mode === 'event' ? conti.eventId : null,
        conti.date,
        TIME_PATTERN.test(String(conti.time || '')) ? conti.time : null,
        conti.mode === 'event' ? 'event' : conti.serviceType,
        conti.title.trim().slice(0, 255),
        ownership.leader,
        String(conti.memo || ''),
        conti.archived ? 1 : 0,
      ],
    );
    await connection.query('DELETE FROM conti_items WHERE conti_id = ?', [contiId]);

    for (let index = 0; index < conti.pages.length; index += 1) {
      const page = conti.pages[index];
      const songId = await upsertSong(connection, page.title || `곡 ${index + 1}`);
      await connection.query(
        `INSERT INTO conti_items
          (id, conti_id, song_id, image_id, position, title, key_name, memo,
           start_instrument, transition_mode, bpm, time_signature)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(page.id || `${conti.id}-page-${index + 1}`).slice(0, 64),
          contiId,
          songId,
          imageIds[index],
          index,
          String(page.title || `곡 ${index + 1}`).trim().slice(0, 255),
          String(page.key || '').trim().slice(0, 32),
          String(page.memo || ''),
          String(page.startInstrument || '').slice(0, 64),
          ['stop', 'continue'].includes(page.transitionMode) ? page.transitionMode : '',
          tempos[index].bpm,
          tempos[index].timeSignature,
        ],
      );
      // 사용자가 직접 적은 Key 는 악보 자체의 정보로 승격시킨다.
      // 다음에 같은 악보를 재사용할 때 Key 가 함께 따라오고, 자동 인식보다 우선한다.
      const typedKey = String(page.key || '').trim().slice(0, 32);
      if (typedKey) {
        await connection.query(
          `UPDATE images
           SET key_name = ?, key_source = 'manual', key_status = 'done', key_checked_at = CURRENT_TIMESTAMP(3)
           WHERE id = ?`,
          [typedKey, imageIds[index]],
        );
      }
      if (songId) {
        await connection.query(
          `INSERT INTO song_images (song_id, image_id, use_count, last_used_at)
           VALUES (?, ?, 1, CURRENT_TIMESTAMP(3))
           ON DUPLICATE KEY UPDATE use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP(3)`,
          [songId, imageIds[index]],
        );
      }
    }
  });

  const contis = await listContis();
  return contis.find(item => item.id === contiId);
}

export async function deleteConti(id, actor) {
  return withTransaction(async connection => {
    const conti = await findContiOwnership(id, connection, true);
    if (!conti) return false;
    assertContiOwner(conti, actor);
    const [result] = await connection.query('DELETE FROM contis WHERE id = ?', [id]);
    return result.affectedRows > 0;
  });
}

export async function updateContiItemMemo(contiId, itemId, memo) {
  const cleanMemo = String(memo || '').trim();
  if (cleanMemo.length > 5000) throw new Error('악보 메모는 5,000자 이하여야 합니다.');
  const [result] = await getPool().query(
    `UPDATE conti_items ci
       JOIN contis c ON c.id = ci.conti_id
        SET ci.memo = ?, ci.updated_at = CURRENT_TIMESTAMP(3),
            c.updated_at = CURRENT_TIMESTAMP(3)
      WHERE ci.id = ? AND ci.conti_id = ?`,
    [cleanMemo, itemId, contiId],
  );
  if (!result.affectedRows) throw new Error('수정할 악보를 찾을 수 없습니다.');
  return { id: itemId, contiId, memo: cleanMemo };
}

export async function updateContiItemCue(contiId, itemId, input = {}) {
  let tempo;
  try { tempo = normalizeTempo(input); } catch (error) { throw new AuthError(error.message, 400); }
  const startInstrument = String(input.startInstrument || '');
  const transitionMode = String(input.transitionMode || '');
  const instrument = startInstrument ? await getInstrumentPreset(startInstrument) : null;
  if (!['', 'stop', 'continue'].includes(transitionMode)) throw new Error('지원하지 않는 곡 전환 방식입니다.');
  const [result] = await getPool().query(
    `UPDATE conti_items ci
       JOIN contis c ON c.id = ci.conti_id
        SET ci.start_instrument = ?, ci.transition_mode = ?,
            ci.bpm = IF(?, ?, ci.bpm), ci.time_signature = IF(?, ?, ci.time_signature),
            ci.updated_at = CURRENT_TIMESTAMP(3), c.updated_at = CURRENT_TIMESTAMP(3)
      WHERE ci.id = ? AND ci.conti_id = ?`,
    [startInstrument, transitionMode, Object.hasOwn(input, 'bpm'), tempo.bpm, Object.hasOwn(input, 'timeSignature'), tempo.timeSignature, itemId, contiId],
  );
  if (!result.affectedRows) throw new Error('수정할 악보를 찾을 수 없습니다.');
  const [[stored]] = await getPool().query('SELECT bpm, time_signature AS timeSignature FROM conti_items WHERE id = ? AND conti_id = ?', [itemId, contiId]);
  return { id: itemId, contiId, startInstrument, startInstrumentLabel: instrument?.label || '', transitionMode, ...stored };
}

export async function findStoredImages(query, limit = 12) {
  const normalized = normalizeSongTitle(query.replace(/\s*악보\s*$/u, '').trim());
  if (!normalized) return [];
  const [rows] = await getPool().query(
    `SELECT i.id, i.width, i.height, i.source_url AS sourceUrl,
            i.key_name AS keyName, i.key_source AS keySource,
            s.title, si.use_count AS useCount, si.last_used_at AS lastUsedAt
       FROM songs s
       JOIN song_images si ON si.song_id = s.id
       JOIN images i ON i.id = si.image_id
      WHERE s.normalized_title = ?
         OR s.normalized_title LIKE CONCAT('%', ?, '%')
         OR ? LIKE CONCAT('%', s.normalized_title, '%')
      ORDER BY (s.normalized_title = ?) DESC, si.use_count DESC, si.last_used_at DESC
      LIMIT ?`,
    [normalized, normalized, normalized, normalized, Number(limit)],
  );
  return rows.map(row => ({
    id: `stored-${row.id}`,
    imageId: row.id,
    title: row.title,
    image: imageUrl(row.id),
    thumbnail: imageUrl(row.id),
    source: '서버에 저장된 악보',
    sourceUrl: row.sourceUrl || imageUrl(row.id),
    sourceType: 'stored',
    stored: true,
    useCount: Number(row.useCount),
    width: row.width,
    height: row.height,
    // 이 악보에 붙어 있는 Key. 재사용할 때 그대로 따라간다.
    key: row.keyName || '',
    keySource: row.keySource || '',
  }));
}
