import { AuthError } from './auth.js';
import { getPool } from './db.js';

const VALID_MODES = new Set(['regular', 'event']);

const normalizeSystem = row => ({
  churchName: row?.churchName || '',
  defaultServiceType: String(row?.defaultServiceType || 'sunday-morning'),
});

const normalizePreferences = row => ({
  defaultMode: VALID_MODES.has(row?.defaultMode) ? row.defaultMode : 'regular',
  viewerZoom: Math.min(200, Math.max(50, Number(row?.viewerZoom) || 100)),
  showNotes: row?.showNotes === undefined ? true : Boolean(row.showNotes),
  quickSignalsEnabled: row?.quickSignalsEnabled === undefined ? true : Boolean(row.quickSignalsEnabled),
  quickSignalsPosition: row?.quickSignalsPosition === 'right' ? 'right' : 'left',
});

export async function getSettings(userId) {
  const pool = getPool();
  const [[systemRows], [preferenceRows]] = await Promise.all([
    pool.query(
      `SELECT church_name AS churchName, default_service_type AS defaultServiceType
         FROM app_settings WHERE id = 1`,
    ),
    pool.query(
      `SELECT default_mode AS defaultMode, viewer_zoom AS viewerZoom,
              show_notes AS showNotes, quick_signals_enabled AS quickSignalsEnabled,
              quick_signals_position AS quickSignalsPosition
         FROM user_preferences WHERE user_id = ?`,
      [userId],
    ),
  ]);
  return {
    system: normalizeSystem(systemRows[0]),
    preferences: normalizePreferences(preferenceRows[0]),
  };
}

export async function updateSystemSettings(actor, input) {
  if (actor.role !== 'admin') throw new AuthError('시스템 설정은 관리자만 변경할 수 있습니다.', 403);
  const churchName = String(input.churchName || '').trim();
  const defaultServiceType = String(input.defaultServiceType || '');
  if (churchName.length > 100) {
    throw new AuthError('설정 값이 너무 깁니다.', 400);
  }
  const [presets] = await getPool().query(
    'SELECT id FROM service_presets WHERE id = ? AND active = 1 LIMIT 1',
    [defaultServiceType],
  );
  if (!presets.length) throw new AuthError('사용 중인 예배 프리셋을 선택해 주세요.', 400);
  await getPool().query(
    `INSERT INTO app_settings
       (id, church_name, default_service_type)
     VALUES (1, ?, ?)
     ON DUPLICATE KEY UPDATE church_name = VALUES(church_name),
       default_service_type = VALUES(default_service_type)`,
    [churchName, defaultServiceType],
  );
  return normalizeSystem({ churchName, defaultServiceType });
}

export async function updatePreferences(userId, input) {
  const defaultMode = VALID_MODES.has(input.defaultMode) ? input.defaultMode : 'regular';
  const viewerZoom = Number(input.viewerZoom);
  if (!Number.isInteger(viewerZoom) || viewerZoom < 50 || viewerZoom > 200) {
    throw new AuthError('기본 확대율은 50~200 사이여야 합니다.', 400);
  }
  const showNotes = input.showNotes !== false;
  const quickSignalsEnabled = input.quickSignalsEnabled !== false;
  const quickSignalsPosition = input.quickSignalsPosition === 'right' ? 'right' : 'left';
  await getPool().query(
    `INSERT INTO user_preferences
       (user_id, default_mode, viewer_zoom, show_notes, quick_signals_enabled, quick_signals_position)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE default_mode = VALUES(default_mode),
       viewer_zoom = VALUES(viewer_zoom), show_notes = VALUES(show_notes),
       quick_signals_enabled = VALUES(quick_signals_enabled),
       quick_signals_position = VALUES(quick_signals_position)`,
    [userId, defaultMode, viewerZoom, showNotes ? 1 : 0, quickSignalsEnabled ? 1 : 0, quickSignalsPosition],
  );
  return normalizePreferences({ defaultMode, viewerZoom, showNotes, quickSignalsEnabled, quickSignalsPosition });
}
