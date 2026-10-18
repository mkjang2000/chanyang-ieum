import React, { useEffect, useRef, useState } from 'react';
import { beatAt, clockSample, estimateClock, resolveTempo } from './metronome.js';

export default function Metronome({ pages, page }) {
  const tempo = resolveTempo(pages, page);
  const beats = Number(tempo.timeSignature.split('/')[0]);
  const clock = useRef(null);
  const lights = useRef([]);
  const [status, setStatus] = useState('동기화 중');
  const [variableTiming, setVariableTiming] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let busy = false;
    let controller;
    let generation = 0;
    const sync = async () => {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      const currentGeneration = generation;
      const samples = [];
      try {
        for (let i = 0; i < 6 && !cancelled; i += 1) {
          controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2000);
          try {
            const sent = performance.now();
            const response = await fetch('/api/clock', { cache: 'no-store', signal: controller.signal });
            const body = await response.json();
            const received = performance.now();
            const sample = clockSample(sent, received, body.receivedAt, body.sentAt);
            if (response.ok && sample && Number.isFinite(body.epoch)) samples.push({ ...sample, epoch: body.epoch });
          } catch { /* 다음 측정으로 재시도 */ }
          finally { clearTimeout(timeout); }
        }
        if (cancelled || currentGeneration !== generation) return;
        const estimate = estimateClock(samples);
        if (estimate) {
          const now = performance.now();
          if (!clock.current || now - clock.current.measured > 30000) {
            clock.current = { ...estimate, target: estimate.offset, measured: now };
          } else {
            // Noisy measurements influence the target less; playback keeps running.
            const weight = estimate.jitter > 16 ? 0.25 : 1;
            clock.current.target += (estimate.offset - clock.current.target) * weight;
            clock.current.measured = now;
          }
          setVariableTiming(estimate.jitter > 16);
          setStatus('');
        } else if (!clock.current || performance.now() - clock.current.measured > 30000) {
          clock.current = null;
          setStatus('연결 확인 중');
        }
      } finally {
        busy = false;
        if (!cancelled && currentGeneration !== generation && document.visibilityState === 'visible') sync();
      }
    };
    const visibility = () => {
      generation += 1;
      clock.current = null;
      setVariableTiming(false);
      setStatus('동기화 중');
      controller?.abort();
      if (document.visibilityState === 'visible') sync();
    };
    sync();
    const timer = setInterval(sync, 5000);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', visibility);
    window.addEventListener('pageshow', visibility);
    return () => { cancelled = true; clearInterval(timer); controller?.abort(); clock.current = null; document.removeEventListener('visibilitychange', visibility); window.removeEventListener('online', visibility); window.removeEventListener('pageshow', visibility); };
  }, []);

  useEffect(() => {
    let frame;
    let last = performance.now();
    const render = () => {
      const now = performance.now();
      const current = clock.current;
      if (current && now - current.measured > 30000) {
        clock.current = null;
        setStatus('연결 확인 중');
      }
      let beat = -1;
      let activeBeat = -1;
      if (current && now - current.measured <= 30000 && document.visibilityState !== 'hidden' && tempo.bpm) {
        // Slew by at most 5ms per second instead of resetting the running beat.
        const correction = Math.min((now - last) * 0.005, 0.1);
        current.offset += Math.max(-correction, Math.min(correction, current.target - current.offset));
        const position = beatAt(now + current.offset, current.epoch, tempo.bpm, beats);
        activeBeat = position.beat;
        if (position.lit) beat = position.beat;
      }
      lights.current.forEach((light, index) => {
        if (light) {
          light.dataset.lit = String(index === beat);
          light.dataset.current = String(index === activeBeat);
        }
      });
      last = now;
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [tempo.bpm, beats]);

  const label = tempo.bpm ? `${tempo.bpm} BPM${status ? ` · ${status}` : variableTiming ? ' · 시각 측정 변동 보정 중' : ''}` : 'BPM 미정';
  return <div className="viewer-metronome" role="img" aria-label={`메트로놈 ${label}`} title={label} data-ready={Boolean(tempo.bpm && !status)}>
    <div className="metronome-beats" aria-hidden="true">{Array.from({ length: beats }, (_, index) => <i key={index} ref={element => { lights.current[index] = element; }} data-first={index === 0} data-lit="false"/>)}</div>
  </div>;
}
