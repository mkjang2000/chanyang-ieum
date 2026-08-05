"use client";

import React, { useEffect, useRef, useState } from 'react';
import {
  Download, FileWarning, Maximize2, Minimize2, Minus, Music2, ZoomIn,
} from 'lucide-react';
import SongTransition from './SongTransition.jsx';
import FlowSignalIcon from './FlowSignalIcon.jsx';

const dateKo = value => {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${'일월화수목금토'[date.getDay()]}요일`;
};

const expiryKo = value => {
  if (!value) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

export default function SharePage() {
  const [state, setState] = useState({ loading: true, conti: null, share: null, error: '' });
  const [token, setToken] = useState('');

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('token') || '';
    setToken(value);
    if (!value) {
      setState({ loading: false, conti: null, share: null, error: '공유 링크가 올바르지 않습니다.' });
      return;
    }
    fetch(`/api/share?token=${encodeURIComponent(value)}`, { cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || '공유 콘티를 열지 못했어요.');
        setState({ loading: false, conti: data.conti, share: data.share, error: '' });
      })
      .catch(error => setState({ loading: false, conti: null, share: null, error: error.message }));
  }, []);

  if (state.loading) {
    return <main className="share-state"><div className="spinner"/><p>공유 콘티를 불러오고 있어요.</p></main>;
  }
  if (state.error || !state.conti) {
    return <main className="share-state share-error"><FileWarning/><h1>콘티를 열 수 없어요</h1><p>{state.error}</p></main>;
  }
  return <SharedDocumentViewer conti={state.conti} share={state.share} token={token}/>;
}

function SharedDocumentViewer({ conti, share, token }) {
  const [page, setPage] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [flowSignal, setFlowSignal] = useState(null);
  const viewerRef = useRef(null);
  const stageRef = useRef(null);
  const thumbsRef = useRef(null);
  const documentPagesRef = useRef(null);
  const pageRefs = useRef([]);
  const activeThumbRef = useRef(null);
  const zoomRef = useRef(100);
  const pendingZoomRef = useRef(100);
  const zoomDisplayValueRef = useRef(100);
  const zoomLabelRefs = useRef([]);
  const zoomFrameRef = useRef(null);
  const scrollFrameRef = useRef(null);
  const pinchRef = useRef(null);
  const pinchScrollFrameRef = useRef(null);
  const flowSignalTimerRef = useRef(null);
  const lastFlowSignalIdRef = useRef('');
  const active = conti.pages[page];
  const pdfUrl = `/api/share/pdf?token=${encodeURIComponent(token)}`;

  useEffect(() => {
    if (!token) return undefined;
    const source = new EventSource(`/api/share/stream?token=${encodeURIComponent(token)}`);
    source.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type !== 'flow.signal' || !message.signal || !message.label
          || !message.id || lastFlowSignalIdRef.current === message.id) return;
        lastFlowSignalIdRef.current = message.id;
        if (flowSignalTimerRef.current) clearTimeout(flowSignalTimerRef.current);
        setFlowSignal(message);
        flowSignalTimerRef.current = setTimeout(() => {
          flowSignalTimerRef.current = null;
          setFlowSignal(null);
        }, 3000);
      } catch { /* 잘못된 실시간 메시지는 무시한다. */ }
    };
    return () => {
      source.close();
      if (flowSignalTimerRef.current) clearTimeout(flowSignalTimerRef.current);
    };
  }, [token]);

  const applyZoom = value => {
    const next = Math.min(300, Math.max(20, value));
    zoomRef.current = next;
    pendingZoomRef.current = next;
    if (zoomFrameRef.current) return;
    zoomFrameRef.current = requestAnimationFrame(() => {
      zoomFrameRef.current = null;
      const committed = pendingZoomRef.current;
      documentPagesRef.current?.style.setProperty('--zoom', String(committed / 100));
      const display = Math.round(committed);
      zoomDisplayValueRef.current = display;
      zoomLabelRefs.current.forEach(label => {
        if (label) label.textContent = `${display}%`;
      });
    });
  };
  const stepZoom = direction => applyZoom(Math.round(zoomRef.current) + direction * 10);
  const scrollToPage = (index, behavior = 'smooth') => {
    const target = pageRefs.current[index];
    const stage = stageRef.current;
    if (!target || !stage) return;
    setPage(index);
    const top = stage.scrollTop + target.getBoundingClientRect().top - stage.getBoundingClientRect().top;
    stage.scrollTo({ top, behavior });
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const fit = () => {
      const style = getComputedStyle(stage);
      const available = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2;
      if (available > 0) applyZoom(Math.min(100, available / 1120 * 100));
    };
    const frame = requestAnimationFrame(fit);
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [conti.id]);

  useEffect(() => {
    const container = thumbsRef.current;
    const target = activeThumbRef.current;
    if (!container || !target) return;
    const top = target.offsetTop;
    const bottom = top + target.offsetHeight;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (bottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = bottom - container.clientHeight;
    }
  }, [page]);
  useEffect(() => () => {
    if (zoomFrameRef.current) cancelAnimationFrame(zoomFrameRef.current);
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
    if (pinchScrollFrameRef.current) cancelAnimationFrame(pinchScrollFrameRef.current);
  }, []);

  const updateActivePage = () => {
    if (scrollFrameRef.current) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const stage = stageRef.current;
      if (!stage) return;
      const stageRect = stage.getBoundingClientRect();
      let bestIndex = 0;
      let bestVisible = -1;
      pageRefs.current.forEach((element, index) => {
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const visible = Math.max(0, Math.min(rect.bottom, stageRect.bottom) - Math.max(rect.top, stageRect.top));
        if (visible > bestVisible) { bestVisible = visible; bestIndex = index; }
      });
      setPage(current => current === bestIndex ? current : bestIndex);
    });
  };
  const onTouchStart = event => {
    if (event.touches.length !== 2 || !stageRef.current) return;
    const [a, b] = event.touches;
    const stage = stageRef.current;
    const rect = stage.getBoundingClientRect();
    const midX = (a.clientX + b.clientX) / 2;
    const midY = (a.clientY + b.clientY) / 2;
    pinchRef.current = {
      distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      zoom: zoomRef.current,
      offsetX: midX - rect.left,
      offsetY: midY - rect.top,
      scrollLeft: stage.scrollLeft,
      scrollTop: stage.scrollTop,
    };
  };
  const onTouchMove = event => {
    const pinch = pinchRef.current;
    if (!pinch || event.touches.length !== 2 || !stageRef.current) return;
    event.preventDefault();
    const [a, b] = event.touches;
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const next = Math.min(300, Math.max(20, pinch.zoom * distance / pinch.distance));
    const scale = next / pinch.zoom;
    applyZoom(next);
    pinch.pendingScale = scale;
    if (pinchScrollFrameRef.current) return;
    pinchScrollFrameRef.current = requestAnimationFrame(() => {
      pinchScrollFrameRef.current = null;
      const stage = stageRef.current;
      if (!stage) return;
      const committedScale = pinch.pendingScale;
      stage.scrollLeft = (pinch.scrollLeft + pinch.offsetX) * committedScale - pinch.offsetX;
      stage.scrollTop = (pinch.scrollTop + pinch.offsetY) * committedScale - pinch.offsetY;
    });
  };
  const onTouchEnd = event => {
    if (event.touches.length < 2) pinchRef.current = null;
  };
  const onWheel = event => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    applyZoom(zoomRef.current * Math.exp(-event.deltaY * .006));
  };

  useEffect(() => {
    const update = () => setIsFullscreen(Boolean(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
    };
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        await exit?.call(document);
      } else {
        const target = viewerRef.current;
        const request = target?.requestFullscreen || target?.webkitRequestFullscreen;
        await request?.call(target);
      }
    } catch { /* 지원하지 않는 브라우저에서는 현재 화면을 유지한다. */ }
  };

  return <main className="share-viewer" ref={viewerRef}>
    <header className="viewer-header share-viewer-header">
      <div className="viewer-title">
        <div className="share-viewer-mark"><Music2/></div>
        <div><span>{dateKo(conti.date)}{conti.time ? ` · ${conti.time}` : ''}</span><h2>{active.title || conti.title}</h2></div>
      </div>
      <div className="viewer-tools">
        <div className="zoom-control">
          <button onClick={() => stepZoom(-1)} aria-label="축소"><Minus/></button>
          <span ref={element => { zoomLabelRefs.current[0] = element; }}>{zoomDisplayValueRef.current}%</span>
          <button onClick={() => stepZoom(1)} aria-label="확대"><ZoomIn/></button>
        </div>
        <a className="share-viewer-download" href={pdfUrl} title="PDF 일괄 다운로드"><Download/><span>PDF</span></a>
        <button title={isFullscreen ? '전체화면 종료' : '전체화면'} onClick={toggleFullscreen}>{isFullscreen ? <Minimize2/> : <Maximize2/>}</button>
      </div>
    </header>

    <div className="viewer-body">
      {flowSignal && <div key={flowSignal.id} className="viewer-flow-alert" style={{ '--signal-color': flowSignal.color }} role="alert" aria-live="assertive">
        <FlowSignalIcon name={flowSignal.icon}/>
        <div><b>{flowSignal.label}</b><span>{flowSignal.sender?.displayName || '인도자'}님의 진행 알림</span></div>
      </div>}
      <aside className="viewer-thumbs share-viewer-thumbs" ref={thumbsRef}>
        <div className="thumb-heading"><span>곡 목록</span><b>{conti.pages.length}곡</b></div>
        {conti.pages.map((item, index) => <button key={item.id} ref={page === index ? activeThumbRef : null} className={page === index ? 'active' : ''} onClick={() => scrollToPage(index)}>
          <span className="thumb-number">{index + 1}</span><img src={item.image} alt="" loading="lazy" decoding="async"/><div><b>{item.title}</b><span>{item.key ? `${item.key} Key` : ''}</span></div>
        </button>)}
        <div className="share-viewer-expiry">만료 {expiryKo(share.expiresAt)}</div>
      </aside>

      <section className="document-stage" ref={stageRef} onScroll={updateActivePage} onWheel={onWheel} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
        <div className="document-pages" ref={documentPagesRef} style={{ '--zoom': 1 }}>
          {conti.pages.map((item, index) => <React.Fragment key={item.id}>
          <article
            className="paper"
            data-cue-in={conti.pages[index - 1]?.transitionMode || undefined}
            data-cue-out={conti.pages[index + 1] ? (item.transitionMode || undefined) : undefined}
            ref={element => { pageRefs.current[index] = element; }}
          >
            <div className="sheet-heading">
              <div className="sheet-cues">
                {item.key && <b className="sheet-key">{item.key}<small>KEY</small></b>}
                {item.startInstrument && <span>{item.startInstrumentLabel || item.startInstrument} 시작</span>}
                {item.transitionMode && <span>{item.transitionMode === 'stop' ? '끊고' : '이어서'}</span>}
              </div>
              <div className="sheet-heading-copy"><h1>{item.title}</h1>{conti.leader && <span>인도 {conti.leader}</span>}</div>
            </div>
            <div className="sheet-image"><img src={item.image} alt={item.title} loading={index < 2 ? 'eager' : 'lazy'} decoding="async"/></div>
            {(item.memo?.trim() || conti.memo?.trim()) && <div className="sheet-memos open">
              {item.memo?.trim() && <div><b>곡 메모</b><span>{item.memo}</span></div>}
              {conti.memo?.trim() && <div><b>콘티 메모</b><span>{conti.memo}</span></div>}
            </div>}
          </article>
          {conti.pages[index + 1] && <SongTransition mode={item.transitionMode} nextTitle={conti.pages[index + 1].title}/>}
          </React.Fragment>)}
        </div>
      </section>

      <div className="viewer-mobile-controls">
        <button onClick={() => stepZoom(-1)} aria-label="축소"><Minus/></button>
        <span ref={element => { zoomLabelRefs.current[1] = element; }}>{zoomDisplayValueRef.current}%</span>
        <button onClick={() => stepZoom(1)} aria-label="확대"><ZoomIn/></button>
        <em>{page + 1} / {conti.pages.length}</em>
      </div>
    </div>
  </main>;
}
