import { randomUUID } from 'node:crypto';
import { AuthError } from './auth.js';
import { getPool, withTransaction } from './db.js';

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const normalizePreset = row => ({
  id: row.id,
  label: row.label,
  short: row.short || '',
  defaultTime: row.defaultTime || '',
  color: row.color,
  sortOrder: Number(row.sortOrder || 0),
  active: Boolean(row.active),
  contiCount: Number(row.contiCount || 0),
});

export async function listServicePresets(connection = getPool()) {
  const [rows] = await connection.query(
    `SELECT sp.id, sp.name AS label, sp.short_label AS short,
            TIME_FORMAT(sp.default_time, '%H:%i') AS defaultTime,
            sp.color, sp.sort_order AS sortOrder, sp.active,
            COUNT(c.id) AS contiCount
       FROM service_presets sp
       LEFT JOIN contis c ON c.mode = 'regular' AND c.service_type = sp.id
      GROUP BY sp.id
      ORDER BY sp.sort_order, sp.name, sp.created_at`,
  );
  return rows.map(normalizePreset);
}

function cleanInput(input, fallback = {}) {
  const label = String(input.label ?? fallback.label ?? '').trim();
  const short = String(input.short ?? fallback.short ?? '').trim();
  const rawTime = String(input.defaultTime ?? fallback.defaultTime ?? '').trim();
  const color = String(input.color ?? fallback.color ?? '#64748b').trim().toLowerCase();
  const sortOrder = Number(input.sortOrder ?? fallback.sortOrder ?? 0);
  if (!label || label.length > 100) throw new AuthError('예배 이름을 100자 이내로 입력해 주세요.', 400);
  if (short.length > 20) throw new AuthError('짧은 이름은 20자 이내로 입력해 주세요.', 400);
  if (rawTime && !TIME_PATTERN.test(rawTime)) throw new AuthError('기본 시간을 확인해 주세요.', 400);
  if (!COLOR_PATTERN.test(color)) throw new AuthError('표시 색상을 확인해 주세요.', 400);
  if (!Number.isInteger(sortOrder) || sortOrder < -9999 || sortOrder > 9999) {
    throw new AuthError('정렬 순서를 확인해 주세요.', 400);
  }
  return {
    label,
    short,
    defaultTime: rawTime || null,
    color,
    sortOrder,
    active: input.active === undefined ? Boolean(fallback.active ?? true) : input.active !== false,
  };
}

export async function createServicePreset(input) {
  const preset = cleanInput(input);
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO service_presets
       (id, name, short_label, default_time, color, sort_order, active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, preset.label, preset.short, preset.defaultTime, preset.color, preset.sortOrder, preset.active ? 1 : 0],
  );
  return (await listServicePresets()).find(item => item.id === id);
}

export async function updateServicePreset(input) {
  const id = String(input.id || '');
  const [rows] = await getPool().query(
    `SELECT id, name AS label, short_label AS short,
            TIME_FORMAT(default_time, '%H:%i') AS defaultTime,
            color, sort_order AS sortOrder, active
       FROM service_presets WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!rows.length) throw new AuthError('예배 프리셋을 찾을 수 없습니다.', 404);
  const preset = cleanInput(input, rows[0]);

  if (!preset.active && rows[0].active) {
    const [[countRow], [settingsRows]] = await Promise.all([
      getPool().query('SELECT COUNT(*) AS count FROM service_presets WHERE active = 1').then(([result]) => result),
      getPool().query('SELECT default_service_type AS id FROM app_settings WHERE id = 1').then(([result]) => result),
    ]);
    if (Number(countRow.count) <= 1) throw new AuthError('최소 한 개의 예배 프리셋은 사용 상태여야 합니다.', 400);
    if (settingsRows?.id === id) throw new AuthError('기본 예배로 지정된 프리셋은 사용 중지할 수 없습니다.', 409);
  }
  await getPool().query(
    `UPDATE service_presets
        SET name = ?, short_label = ?, default_time = ?, color = ?, sort_order = ?, active = ?
      WHERE id = ?`,
    [preset.label, preset.short, preset.defaultTime, preset.color, preset.sortOrder, preset.active ? 1 : 0, id],
  );
  return (await listServicePresets()).find(item => item.id === id);
}

export async function deleteServicePreset(id) {
  return withTransaction(async connection => {
    const [rows] = await connection.query('SELECT id FROM service_presets WHERE id = ? LIMIT 1 FOR UPDATE', [id]);
    if (!rows.length) return false;
    const [[usage], [settings], [active]] = await Promise.all([
      connection.query(`SELECT COUNT(*) AS count FROM contis WHERE mode = 'regular' AND service_type = ?`, [id]),
      connection.query('SELECT COUNT(*) AS count FROM app_settings WHERE default_service_type = ?', [id]),
      connection.query('SELECT COUNT(*) AS count FROM service_presets WHERE active = 1'),
    ]);
    if (Number(usage[0].count) > 0) throw new AuthError('기존 콘티에서 사용 중인 프리셋은 삭제할 수 없습니다. 사용 중지를 이용해 주세요.', 409);
    if (Number(settings[0].count) > 0) throw new AuthError('기본 예배로 지정된 프리셋은 삭제할 수 없습니다.', 409);
    const [[target]] = await connection.query('SELECT active FROM service_presets WHERE id = ?', [id]);
    if (target.active && Number(active[0].count) <= 1) throw new AuthError('마지막 예배 프리셋은 삭제할 수 없습니다.', 400);
    const [result] = await connection.query('DELETE FROM service_presets WHERE id = ?', [id]);
    return result.affectedRows > 0;
  });
}

export async function assertServicePresetExists(id, connection = getPool()) {
  const [rows] = await connection.query('SELECT id FROM service_presets WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw new AuthError('예배 종류를 확인해 주세요.', 400);
}
