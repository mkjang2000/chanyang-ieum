import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activePageAt, beatAt, clockSample, estimateClock, METRONOME_EPOCH, normalizeTempo, resolveTempo, tappedBpm } from '../../metronome.js';

test('이어서 연결된 곡은 중간 BPM과 무관하게 같은 박자 시점을 유지한다', () => {
  const pages = [
    { bpm: 120, timeSignature: '4/4', transitionMode: 'continue' },
    { bpm: 99, transitionMode: 'continue' },
    { bpm: 150, timeSignature: '3/4', transitionMode: 'stop' },
    { bpm: 80 },
  ];
  assert.deepEqual(pages.map((_, i) => resolveTempo(pages, i).bpm), [120, 120, 120, 80]);
  for (const elapsed of [0, 83, 499, 500, 1999, 2000, 86400123]) {
    const first = resolveTempo(pages, 0), next = resolveTempo(pages, 2);
    assert.equal(beatAt(METRONOME_EPOCH + elapsed, METRONOME_EPOCH, first.bpm, 4).lit,
      beatAt(METRONOME_EPOCH + elapsed, METRONOME_EPOCH, next.bpm, 3).lit);
  }
  assert.equal(resolveTempo([{ transitionMode: 'continue' }, { bpm: 120 }], 1).bpm, null);
});

test('새 접속과 프레임 누락은 기준 박자를 다시 시작하지 않는다', () => {
  assert.deepEqual(beatAt(METRONOME_EPOCH + 1500, METRONOME_EPOCH, 120, 4), { beat: 3, lit: true });
  assert.deepEqual(beatAt(METRONOME_EPOCH + 2000, METRONOME_EPOCH, 120, 4), { beat: 0, lit: true });
  assert.equal(beatAt(METRONOME_EPOCH + 1900, METRONOME_EPOCH, 120, 4).lit, false);
});

test('위 악보의 75%가 넘어가는 경계에서만 다음 곡으로 전환한다', () => {
  const rects = [{ top: 100, height: 800 }, { top: 950, height: 400 }, { top: 1400, height: 800 }];
  assert.equal(activePageAt(rects, 699), 0);
  assert.equal(activePageAt(rects, 700), 1);
  assert.equal(activePageAt(rects, 1249), 1);
  assert.equal(activePageAt(rects, 1250), 2);
  assert.equal(activePageAt(rects, 400), 0); // scroll back
  assert.equal(activePageAt([{ top: 0, height: 0 }, rects[1]], 10), 0);
});

test('서버 처리 시간을 제외해 서로 다른 기기의 단조 시계를 보정한다', () => {
  const a = clockSample(100, 112, 10004, 10008);
  const b = clockSample(700, 712, 10004, 10008);
  assert.equal(a.delay, 8);
  assert.equal(112 + a.offset, 712 + b.offset);
  assert.equal(112 + a.offset, 10012);
  assert.equal(clockSample(10, 11, 100, 105), null);
  assert.equal(clockSample(10, 11, NaN, 100), null);
});

test('탭 BPM은 최소 세 번 측정하고 한 번의 빗나간 탭에 흔들리지 않는다', () => {
  assert.equal(tappedBpm([0, 500]), null);
  assert.equal(tappedBpm([0, 500, 1000, 1500, 2200, 2700]), 120);
  assert.equal(tappedBpm([0, 100, 200]), null);
});

test('미정 값을 보존하고 잘못된 BPM과 박자는 거절한다', () => {
  assert.deepEqual(normalizeTempo({}), { bpm: null, timeSignature: '' });
  assert.deepEqual(normalizeTempo({ bpm: '120', timeSignature: '6/8' }), { bpm: 120, timeSignature: '6/8' });
  for (const bpm of [0, 19, 301, 120.5, Infinity, 'abc']) assert.throws(() => normalizeTempo({ bpm }));
  assert.throws(() => normalizeTempo({ timeSignature: '4/3' }));
});


test('50ms 이상 왕복 지연도 보정하며 빠른 측정들의 중앙값으로 이상치를 줄인다', () => {
  const sample = (delay, offset) => ({ delay, offset, epoch: METRONOME_EPOCH });
  const samples = [sample(52, 1002), sample(50, 1000), sample(55, 1040), sample(500, 1200), sample(200, 900), sample(400, 1800)];
  const estimate = estimateClock(samples);
  assert.equal(estimate.offset, 1002);
  assert.equal(estimate.delay, 50);
  assert.equal(estimate.jitter, 40);
  assert.equal(samples[0].delay, 52);
  assert.equal(estimateClock([sample(250, 1000)]).offset, 1000);
  assert.equal(estimateClock([sample(60, 1000), sample(65, 1002)]).offset, 1001);
  assert.equal(estimateClock([]), null);
  assert.equal(estimateClock([sample(-1, 0), sample(50, NaN)]), null);
});
