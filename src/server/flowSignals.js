import { randomUUID } from 'node:crypto';
import { AuthError } from './auth.js';
import { getPool, withTransaction } from './db.js';
import { FLOW_SIGNAL_ICON_IDS } from '../flowSignalConfig.js';

const MAX_SIGNALS = 5;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const publicSignal = row => ({
  id: row.id,
  label: row.label,
  shortLabel: row.shortLabel || row.label,
  icon: row.icon,
  color: row.color,
  sortOrder: Number(row.sortOrder || 0),
});

const cleanInput = input => {
  const label = String(input.label || '').trim();
  const shortLabel = String(input.shortLabel || label).trim();
  const icon = String(input.icon || 'music-2');
  const color = String(input.color || '#93c5fd').toLowerCase();
  const sortOrder = Math.max(0, Math.min(999, Number.parseInt(input.sortOrder, 10) || 0));
  if (!label || label.length > 30) throw new AuthError('알림 이름은 1~30자로 입력해 주세요.', 400);
  if (!shortLabel || shortLabel.length > 12) throw new AuthError('버튼 이름은 1~12자로 입력해 주세요.', 400);
  if (!FLOW_SIGNAL_ICON_IDS.has(icon)) throw new AuthError('지원하는 아이콘을 선택해 주세요.', 400);
  if (!COLOR_PATTERN.test(color)) throw new AuthError('알림 색상을 확인해 주세요.', 400);
  return { label, shortLabel, icon, color, sortOrder };
};

export async function listFlowSignals(connection = getPool()) {
  const [rows] = await connection.query(
    `SELECT id, label, short_label AS shortLabel, icon, color, sort_order AS sortOrder
       FROM flow_signal_presets
      ORDER BY sort_order, created_at, label`,
  );
  return rows.map(publicSignal);
}

export async function getFlowSignal(id, connection = getPool()) {
  const [rows] = await connection.query(
    `SELECT id, label, short_label AS shortLabel, icon, color, sort_order AS sortOrder
       FROM flow_signal_presets WHERE id = ? LIMIT 1`,
    [String(id || '')],
  );
  if (!rows.length) throw new AuthError('사용할 수 없는 진행 알림입니다.', 400);
  return publicSignal(rows[0]);
}

export async function createFlowSignal(input) {
  const signal = cleanInput(input);
  const id = randomUUID();
  await withTransaction(async connection => {
    const [[count]] = await connection.query('SELECT COUNT(*) AS count FROM flow_signal_presets FOR UPDATE');
    if (Number(count.count) >= MAX_SIGNALS) throw new AuthError(`진행 알림은 최대 ${MAX_SIGNALS}개까지 만들 수 있습니다.`, 409);
    await connection.query(
      `INSERT INTO flow_signal_presets (id, label, short_label, icon, color, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, signal.label, signal.shortLabel, signal.icon, signal.color, signal.sortOrder],
    );
  });
  return getFlowSignal(id);
}

export async function updateFlowSignal(id, input) {
  const signal = cleanInput(input);
  const [result] = await getPool().query(
    `UPDATE flow_signal_presets
        SET label = ?, short_label = ?, icon = ?, color = ?, sort_order = ?
      WHERE id = ?`,
    [signal.label, signal.shortLabel, signal.icon, signal.color, signal.sortOrder, String(id || '')],
  );
  if (!result.affectedRows) throw new AuthError('진행 알림을 찾을 수 없습니다.', 404);
  return getFlowSignal(id);
}

export async function deleteFlowSignal(id) {
  const [result] = await getPool().query('DELETE FROM flow_signal_presets WHERE id = ?', [String(id || '')]);
  if (!result.affectedRows) throw new AuthError('진행 알림을 찾을 수 없습니다.', 404);
  return true;
}
