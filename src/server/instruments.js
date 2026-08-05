import { randomUUID } from 'node:crypto';
import { AuthError } from './auth.js';
import { getPool, withTransaction } from './db.js';

const MAX_INSTRUMENTS = 30;

const normalizeInstrument = row => ({
  id: row.id,
  label: row.label,
  sortOrder: Number(row.sortOrder || 0),
  active: Boolean(row.active),
  usageCount: Number(row.usageCount || 0),
});

function cleanInput(input, fallback = {}) {
  const label = String(input.label ?? fallback.label ?? '').trim();
  const sortOrder = Number(input.sortOrder ?? fallback.sortOrder ?? 0);
  if (!label || label.length > 50) throw new AuthError('악기 이름은 1~50자로 입력해 주세요.', 400);
  if (!Number.isInteger(sortOrder) || sortOrder < -9999 || sortOrder > 9999) {
    throw new AuthError('정렬 순서를 확인해 주세요.', 400);
  }
  return {
    label,
    sortOrder,
    active: input.active === undefined ? Boolean(fallback.active ?? true) : Boolean(input.active),
  };
}

export async function listInstrumentPresets(connection = getPool()) {
  const [rows] = await connection.query(
    `SELECT ip.id, ip.name AS label, ip.sort_order AS sortOrder, ip.active,
            COUNT(ci.id) AS usageCount
       FROM instrument_presets ip
       LEFT JOIN conti_items ci ON ci.start_instrument = ip.id
      GROUP BY ip.id
      ORDER BY ip.sort_order, ip.name, ip.created_at`,
  );
  return rows.map(normalizeInstrument);
}

export async function getInstrumentPreset(id, connection = getPool()) {
  const [rows] = await connection.query(
    `SELECT id, name AS label, sort_order AS sortOrder, active
       FROM instrument_presets WHERE id = ? LIMIT 1`,
    [String(id || '')],
  );
  if (!rows.length) throw new AuthError('사용할 수 없는 시작 악기입니다.', 400);
  return normalizeInstrument(rows[0]);
}

export async function assertInstrumentPresetsExist(ids, connection = getPool()) {
  const unique = [...new Set((ids || []).map(value => String(value || '')).filter(Boolean))];
  if (!unique.length) return;
  const placeholders = unique.map(() => '?').join(',');
  const [rows] = await connection.query(
    `SELECT id FROM instrument_presets WHERE id IN (${placeholders})`,
    unique,
  );
  if (rows.length !== unique.length) throw new AuthError('콘티의 시작 악기 설정을 확인해 주세요.', 400);
}

export async function createInstrumentPreset(input) {
  const instrument = cleanInput(input);
  const id = randomUUID();
  try {
    await withTransaction(async connection => {
      const [[count]] = await connection.query('SELECT COUNT(*) AS count FROM instrument_presets FOR UPDATE');
      if (Number(count.count) >= MAX_INSTRUMENTS) {
        throw new AuthError(`시작 악기는 최대 ${MAX_INSTRUMENTS}개까지 만들 수 있습니다.`, 409);
      }
      await connection.query(
        `INSERT INTO instrument_presets (id, name, sort_order, active)
         VALUES (?, ?, ?, ?)`,
        [id, instrument.label, instrument.sortOrder, instrument.active ? 1 : 0],
      );
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new AuthError('같은 이름의 악기가 이미 있습니다.', 409);
    throw error;
  }
  return getInstrumentPreset(id);
}

export async function updateInstrumentPreset(id, input) {
  const current = await getInstrumentPreset(id);
  const instrument = cleanInput(input, current);
  try {
    const [result] = await getPool().query(
      `UPDATE instrument_presets
          SET name = ?, sort_order = ?, active = ?
        WHERE id = ?`,
      [instrument.label, instrument.sortOrder, instrument.active ? 1 : 0, String(id || '')],
    );
    if (!result.affectedRows) throw new AuthError('시작 악기를 찾을 수 없습니다.', 404);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new AuthError('같은 이름의 악기가 이미 있습니다.', 409);
    throw error;
  }
  return getInstrumentPreset(id);
}

export async function deleteInstrumentPreset(id) {
  return withTransaction(async connection => {
    const instrument = await getInstrumentPreset(id, connection);
    const [[usage]] = await connection.query(
      'SELECT COUNT(*) AS count FROM conti_items WHERE start_instrument = ?',
      [instrument.id],
    );
    if (Number(usage.count) > 0) {
      throw new AuthError('기존 콘티에서 사용 중인 악기는 삭제할 수 없습니다. 사용 중지를 이용해 주세요.', 409);
    }
    const [result] = await connection.query('DELETE FROM instrument_presets WHERE id = ?', [instrument.id]);
    return result.affectedRows > 0;
  });
}
