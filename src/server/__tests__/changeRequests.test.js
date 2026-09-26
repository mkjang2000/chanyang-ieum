import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertRequestAccess, assertRequestAction, isRequestStale } from '../changeRequests.js';

const conti = { ownerUserId: 'leader' };
const leader = { id: 'leader', role: 'leader' };
const admin = { id: 'admin', role: 'admin' };
const player = { id: 'player', role: 'accompanist' };
const item = { imageId: 'old', key: 'G', contiKey: '', title: '찬양' };
const request = { requesterId: 'player', status: 'pending', beforeImageId: 'old', beforeKey: 'G', beforeContiKey: '', title: '찬양' };
const denied = (fn, status = 403) => assert.throws(fn, error => error.status === status);

test('요청 조회는 반주자, 담당 인도자, 관리자만 허용한다', () => {
  for (const actor of [player, leader, admin]) assertRequestAccess(conti, actor);
  for (const actor of [{ id: 'other', role: 'leader' }, { id: 'leader', role: 'member' }, { id: 'leader', role: 'Admin' }]) {
    denied(() => assertRequestAccess(conti, actor));
  }
  denied(() => assertRequestAccess(null, admin), 404);
});

test('승인과 반려는 담당 인도자 또는 관리자만 수행한다', () => {
  for (const action of ['approve', 'reject']) {
    for (const actor of [leader, admin]) assertRequestAction(request, conti, actor, action, item);
    for (const actor of [player, { id: 'leader', role: 'accompanist' }, { id: 'other', role: 'leader' }]) {
      denied(() => assertRequestAction(request, conti, actor, action, item));
    }
  }
});

test('요청 취소는 요청한 반주자만 가능하다', () => {
  assertRequestAction(request, conti, player, 'cancel', item);
  for (const actor of [leader, admin, { id: 'other', role: 'accompanist' }]) {
    denied(() => assertRequestAction(request, conti, actor, 'cancel', item));
  }
});

test('원본 이미지, Key, 곡 제목 변경 및 곡 삭제 시 승인을 막지만 반려와 취소는 허용한다', () => {
  for (const changed of [null, { ...item, imageId: 'new' }, { ...item, key: 'A' }, { ...item, contiKey: 'G' }, { ...item, title: '다른 곡' }]) {
    assert.equal(isRequestStale(request, changed), true);
    denied(() => assertRequestAction(request, conti, leader, 'approve', changed), 409);
    assertRequestAction(request, conti, leader, 'reject', changed);
    assertRequestAction(request, conti, player, 'cancel', changed);
  }
  assert.equal(isRequestStale(request, { ...item, memo: '새 메모', position: 3 }), false);
});

test('종료된 요청은 재처리할 수 없다', () => {
  for (const status of ['approved', 'rejected', 'cancelled']) {
    for (const action of ['approve', 'reject']) denied(() => assertRequestAction({ ...request, status }, conti, leader, action, item), 409);
    denied(() => assertRequestAction({ ...request, status }, conti, player, 'cancel', item), 409);
  }
  denied(() => assertRequestAction(request, conti, leader, 'unknown', item), 400);
});
