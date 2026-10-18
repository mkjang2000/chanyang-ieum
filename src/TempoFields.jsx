import React, { useRef, useState } from 'react';
import { TIME_SIGNATURES, tappedBpm } from './metronome.js';

export default function TempoFields({ value, onChange, inherited = false, inheritedBpm = null, disabled = false }) {
  const taps = useRef([]);
  const [estimate, setEstimate] = useState(null);
  const [count, setCount] = useState(0);
  const tap = () => {
    const now = performance.now();
    if (taps.current.length && now - taps.current.at(-1) > 3200) taps.current = [];
    taps.current = [...taps.current, now].slice(-9);
    setCount(taps.current.length);
    setEstimate(tappedBpm(taps.current));
  };
  return <div className="tempo-fields">
    <label>박자<select aria-label="박자" disabled={disabled} value={value.timeSignature || ''} onChange={event => onChange({ timeSignature: event.target.value })}>
      <option value="">미정 (4/4)</option>{TIME_SIGNATURES.map(meter => <option key={meter}>{meter}</option>)}
    </select></label>
    <label>BPM<input aria-label="BPM" type="number" min="20" max="300" step="1" placeholder="미정" disabled={disabled || inherited} value={inherited ? (inheritedBpm || '') : (value.bpm ?? '')} onChange={event => onChange({ bpm: event.target.value === '' ? null : Number(event.target.value) })}/></label>
    {inherited ? <small>이어서 · 앞 구간의 BPM과 점멸 유지</small> : <>
      <button type="button" className="secondary-button tempo-tap" disabled={disabled} onClick={tap}>탭으로 찾기</button>
      <span className="tempo-estimate" aria-live="polite">{estimate ? `약 ${estimate} BPM` : count ? '세 번 이상 두드려 주세요' : ''}</span>
      {estimate && <button type="button" className="secondary-button" disabled={disabled} onClick={() => { onChange({ bpm: estimate }); taps.current = []; setCount(0); setEstimate(null); }}>적용</button>}
    </>}
    <small className="tempo-unit">탭·점멸 한 번 = {value.timeSignature?.endsWith('/8') ? '8분' : '4분'}음표 한 박</small>
  </div>;
}
