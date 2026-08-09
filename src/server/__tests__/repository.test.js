/* 콘티 수정·삭제 권한.
 *
 * 이 판정이 느슨해지면 다른 인도자의 콘티를 지울 수 있게 되는데,
 * 화면에서는 버튼이 숨겨져 있어 눈으로는 잘 드러나지 않는다.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertContiOwner } from '../repository.js';

const admin = { id: 'user-admin', role: 'admin' };
const owner = { id: 'user-owner', role: 'leader' };
const stranger = { id: 'user-other', role: 'leader' };
const accompanist = { id: 'user-acc', role: 'accompanist' };
const member = { id: 'user-member', role: 'member' };
const conti = { ownerUserId: 'user-owner' };

const denied = (target, actor) => {
  assert.throws(() => assertContiOwner(target, actor), error => {
    assert.equal(error.status, 403, '권한 거부는 403 이어야 한다');
    return true;
  });
};

test('관리자는 모든 콘티를 관리한다', () => {
  assert.doesNotThrow(() => assertContiOwner(conti, admin));
});

test('담당 인도자는 본인 콘티를 관리한다', () => {
  assert.doesNotThrow(() => assertContiOwner(conti, owner));
});

test('다른 인도자의 콘티는 막는다', () => {
  denied(conti, stranger);
});

test('반주자와 성도는 콘티를 관리하지 못한다', () => {
  denied(conti, accompanist);
  denied(conti, member);
});

test('담당자가 지정되지 않은 콘티는 관리자만 관리한다', () => {
  // 인도자 계정이 삭제되면 owner_user_id 가 NULL 로 남는다.
  const orphan = { ownerUserId: null };
  assert.doesNotThrow(() => assertContiOwner(orphan, admin));
  denied(orphan, owner);
});

test('콘티 정보가 없으면 관리자만 통과한다', () => {
  assert.doesNotThrow(() => assertContiOwner(null, admin));
  denied(null, owner);
});

test('역할 이름이 비슷해도 관리자로 인정하지 않는다', () => {
  for (const role of ['Admin', 'ADMIN', 'administrator', '', undefined]) {
    denied(conti, { id: 'user-x', role });
  }
});
