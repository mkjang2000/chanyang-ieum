export const TIME_SIGNATURES = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8'];
// Stable across reconnects and server restarts. Every tempo runs against this epoch.
export const METRONOME_EPOCH = Date.UTC(2026, 0, 1);

export function normalizeTempo(input = {}) {
  const bpm = input.bpm === '' || input.bpm == null ? null : Number(input.bpm);
  const timeSignature = input.timeSignature || '';
  if (bpm !== null && (!Number.isInteger(bpm) || bpm < 20 || bpm > 300)) {
    throw new Error('BPM은 20~300 사이의 정수로 입력해 주세요.');
  }
  if (timeSignature && !TIME_SIGNATURES.includes(timeSignature)) throw new Error('지원하지 않는 박자입니다.');
  return { bpm, timeSignature };
}

export function resolveTempo(pages, index) {
  let sourceIndex = Math.max(0, Math.min(index, pages.length - 1));
  while (sourceIndex > 0 && pages[sourceIndex - 1].transitionMode === 'continue') sourceIndex -= 1;
  const source = pages[sourceIndex] || {};
  return {
    bpm: Number(source.bpm) || null,
    timeSignature: pages[index]?.timeSignature || source.timeSignature || '4/4',
    sourceIndex,
    inherited: sourceIndex !== index,
  };
}

// The meter denominator is the pulse unit (6/8: one tap/flash per eighth note).
export function beatAt(serverTime, epoch, bpm, beatsPerBar) {
  const period = 60000 / bpm;
  const elapsed = serverTime - epoch;
  const count = Math.floor(elapsed / period);
  return { beat: ((count % beatsPerBar) + beatsPerBar) % beatsPerBar, lit: elapsed - count * period < Math.min(90, period * 0.3) };
}

export function activePageAt(rects, viewportTop) {
  let index = 0;
  for (let i = 0; i < rects.length - 1; i += 1) {
    const rect = rects[i];
    if (!rect || rect.height <= 0) break;
    if (viewportTop >= rect.top + rect.height * 0.75) index = i + 1;
    else break;
  }
  return index;
}

export function clockSample(sent, received, serverReceived, serverSent) {
  const delay = received - sent - (serverSent - serverReceived);
  if (![sent, received, serverReceived, serverSent].every(Number.isFinite) || delay < 0 || serverSent < serverReceived) return null;
  return { offset: ((serverReceived - sent) + (serverSent - received)) / 2, delay };
}

export function estimateClock(samples) {
  const candidates = samples.filter(sample => Number.isFinite(sample.offset)
    && Number.isFinite(sample.delay) && sample.delay >= 0 && Number.isFinite(sample.epoch));
  if (!candidates.length) return null;
  // Prefer the least queued probes, then use their median to resist a single outlier.
  // RTT is not the inter-device clock error, so it is never an activation threshold.
  const selected = candidates.sort((a, b) => a.delay - b.delay).slice(0, 3);
  const offsets = selected.map(sample => sample.offset).sort((a, b) => a - b);
  const middle = Math.floor(offsets.length / 2);
  const offset = offsets.length % 2 ? offsets[middle] : (offsets[middle - 1] + offsets[middle]) / 2;
  return { offset, epoch: selected[0].epoch, delay: selected[0].delay, jitter: offsets.at(-1) - offsets[0] };
}

export function tappedBpm(taps) {
  if (taps.length < 3) return null;
  const intervals = taps.slice(1).map((time, index) => time - taps[index]).sort((a, b) => a - b);
  const middle = Math.floor(intervals.length / 2);
  const median = intervals.length % 2 ? intervals[middle] : (intervals[middle - 1] + intervals[middle]) / 2;
  const bpm = Math.round(60000 / median);
  return bpm >= 20 && bpm <= 300 ? bpm : null;
}
