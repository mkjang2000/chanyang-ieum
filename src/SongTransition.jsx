"use client";

import React from 'react';
import { Link2, Scissors } from 'lucide-react';

/**
 * 곡과 곡 사이에 놓이는 전환 표시.
 *
 * 악보 종이(.paper)는 건드리지 않고 종이 바깥 여백에만 색을 입혀,
 * 스크롤로 상단 헤더가 사라져도 다음 곡으로 어떻게 넘어가는지 보이게 한다.
 * 뷰어와 공유 페이지가 같은 모양을 써야 해서 별도 파일로 둔다.
 */
export default function SongTransition({ mode, nextTitle }) {
  const known = mode === 'continue' || mode === 'stop';
  const label = mode === 'stop' ? '끊고' : mode === 'continue' ? '이어짐' : '전환 미정';
  return <div className={`song-transition ${known ? mode : 'unset'}`} aria-hidden="true">
    <span className="song-transition-line"/>
    <span className="song-transition-badge">
      {mode === 'stop' ? <Scissors/> : mode === 'continue' ? <Link2/> : null}
      <b>{label}</b>
      {nextTitle && <em>{nextTitle}</em>}
    </span>
    <span className="song-transition-line"/>
  </div>;
}
