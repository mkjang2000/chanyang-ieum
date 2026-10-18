import { randomUUID } from 'node:crypto';
import { getPool } from './db.js';

const subscribers = new Map();
const editors = new Map();
const encoder = new TextEncoder();
const PRESENCE_TTL = 30000;

const contiEditors = (contiId, create = true) => {
  let values = editors.get(contiId);
  if (!values && create) {
    values = new Map();
    editors.set(contiId, values);
  }
  return values;
};

const pruneExpired = (contiId, now = Date.now()) => {
  const values = contiEditors(contiId, false);
  const changedItems = new Set();
  if (!values) return changedItems;
  for (const [key, editor] of values) {
    if (now - editor.lastSeen <= PRESENCE_TTL) continue;
    values.delete(key);
    changedItems.add(editor.itemId);
  }
  if (!values.size) editors.delete(contiId);
  return changedItems;
};

const publicEditor = editor => ({
  userId: editor.userId,
  clientId: editor.clientId,
  displayName: editor.displayName,
});

const activeEditors = (contiId, itemId = null) => {
  pruneExpired(contiId);
  const values = contiEditors(contiId, false);
  if (!values) return [];
  const result = [];
  for (const editor of values.values()) {
    if (!itemId || editor.itemId === itemId) result.push(publicEditor(editor));
  }
  return result;
};

const presenceSnapshot = contiId => {
  pruneExpired(contiId);
  const values = contiEditors(contiId, false);
  const items = {};
  if (!values) return items;
  for (const editor of values.values()) {
    if (!items[editor.itemId]) items[editor.itemId] = [];
    items[editor.itemId].push(publicEditor(editor));
  }
  return items;
};

const send = (controller, payload) => {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
};

export function publishContiEvent(contiId, payload) {
  const listeners = subscribers.get(contiId);
  if (!listeners) return;
  for (const listener of [...listeners]) {
    try {
      send(listener.controller, payload);
    } catch {
      listener.close();
    }
  }
}

export async function assertContiExists(contiId) {
  const [rows] = await getPool().query('SELECT id FROM contis WHERE id = ? LIMIT 1', [contiId]);
  if (!rows.length) throw new Error('콘티를 찾을 수 없습니다.');
}

export async function loadMemoSnapshot(contiId) {
  const [rows] = await getPool().query(
    'SELECT id, memo FROM conti_items WHERE conti_id = ? ORDER BY position ASC',
    [contiId],
  );
  return Object.fromEntries(rows.map(row => [row.id, row.memo || '']));
}

export async function loadCueSnapshot(contiId) {
  const [rows] = await getPool().query(
    `SELECT ci.id, ci.start_instrument AS startInstrument, ip.name AS startInstrumentLabel,
            ci.transition_mode AS transitionMode, ci.bpm, ci.time_signature AS timeSignature
       FROM conti_items ci LEFT JOIN instrument_presets ip ON ip.id = ci.start_instrument
      WHERE ci.conti_id = ? ORDER BY ci.position`, [contiId],
  );
  return rows;
}

export async function setEditingPresence(contiId, itemId, user, clientId, active) {
  const cleanClientId = String(clientId || '').slice(0, 64);
  if (!contiId || !itemId || !cleanClientId) throw new Error('편집 상태 정보가 올바르지 않습니다.');
  const [rows] = await getPool().query(
    'SELECT id FROM conti_items WHERE id = ? AND conti_id = ? LIMIT 1',
    [itemId, contiId],
  );
  if (!rows.length) throw new Error('악보를 찾을 수 없습니다.');
  const values = contiEditors(contiId);
  const key = `${user.id}:${cleanClientId}`;
  const previousItemId = values.get(key)?.itemId;
  if (active) {
    values.set(key, {
      itemId,
      userId: user.id,
      clientId: cleanClientId,
      displayName: user.displayName || user.username,
      lastSeen: Date.now(),
    });
  } else {
    values.delete(key);
  }
  if (!values.size) editors.delete(contiId);
  if (previousItemId && previousItemId !== itemId) {
    publishContiEvent(contiId, {
      type: 'presence.updated',
      itemId: previousItemId,
      editors: activeEditors(contiId, previousItemId),
    });
  }
  const itemEditors = activeEditors(contiId, itemId);
  publishContiEvent(contiId, { type: 'presence.updated', itemId, editors: itemEditors });
  return { itemId, editors: itemEditors };
}

export function publishMemoUpdated(contiId, itemId, memo, user) {
  publishContiEvent(contiId, {
    type: 'memo.updated',
    itemId,
    memo,
    editor: { userId: user.id, displayName: user.displayName },
  });
}

export function publishFlowSignal(contiId, signal, user) {
  const payload = {
    type: 'flow.signal',
    id: randomUUID(),
    signal: signal.id,
    label: signal.label,
    shortLabel: signal.shortLabel,
    icon: signal.icon,
    color: signal.color,
    sender: {
      userId: user.id,
      displayName: user.displayName || user.username,
    },
    sentAt: new Date().toISOString(),
  };
  publishContiEvent(contiId, payload);
  return payload;
}

export function createContiEventStream(contiId, memoSnapshot = {}, { includeSnapshots = true, cueSnapshot = [] } = {}) {
  let listener;
  return new ReadableStream({
    start(controller) {
      const listeners = subscribers.get(contiId) || new Set();
      let heartbeat;
      const close = () => {
        clearInterval(heartbeat);
        listeners.delete(listener);
        if (!listeners.size) subscribers.delete(contiId);
        try { controller.close(); } catch { /* 이미 닫힌 연결 */ }
      };
      listener = { controller, close };
      listeners.add(listener);
      subscribers.set(contiId, listeners);
      send(controller, { type: 'cue.snapshot', items: cueSnapshot });
      if (includeSnapshots) {
        send(controller, { type: 'presence.snapshot', items: presenceSnapshot(contiId) });
        send(controller, { type: 'memo.snapshot', items: memoSnapshot });
      }
      heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keep-alive\n\n')); } catch { close(); }
      }, 15000);
    },
    cancel() {
      listener?.close();
    },
  });
}

const sweep = setInterval(() => {
  for (const contiId of [...editors.keys()]) {
    const changedItems = pruneExpired(contiId);
    for (const itemId of changedItems) {
      publishContiEvent(contiId, { type: 'presence.updated', itemId, editors: activeEditors(contiId, itemId) });
    }
  }
}, 10000);
sweep.unref?.();
