"use client";

import TempoFields from './TempoFields.jsx';
import Metronome from './Metronome.jsx';
import { activePageAt, resolveTempo } from './metronome.js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ChevronDown, ChevronUp, Download, FileImage, Maximize2, Minimize2,
  MessageSquarePlus, Minus, PanelLeftClose, PanelLeftOpen, Plus, Share2, X, ZoomIn,
} from 'lucide-react';
import ChangeRequests, { requestApi } from './ChangeRequests.jsx';
import FlowSignalIcon from './FlowSignalIcon.jsx';
import SongTransition from './SongTransition.jsx';
import { ModalShell, ShareModal } from './AppModals.jsx';
import { dateKo, instrumentLabel, selectableInstruments } from './appUtils.js';

export default function DocumentViewer({
  conti, canEditMemo, canEditCues, canSendSignals, flowSignals = [],
  instrumentPresets = [],
  quickSignalsEnabled = true, quickSignalsPosition = 'left', canShare,
  onSaveMemo, onRemoteMemo, onSaveCue, onClose, currentUser, songs = [], onContiChange,
}) {
  const latestContiRef = useRef(conti);
  latestContiRef.current = conti;
  const [tempoItemId, setTempoItemId] = useState(null);
  const [tempoDraft, setTempoDraft] = useState({});
  const [page, setPage] = useState(0);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState('');
  const requestsButtonRef = useRef(null);
  const requestSequence = useRef(0);
  const pendingRequestCount = requests.filter(item => item.status === 'pending').length;
  const canRequest = currentUser?.role === 'accompanist' || canEditCues;
  const contiChangeRef = useRef(onContiChange);
  contiChangeRef.current = onContiChange;
  const refreshRequests = useCallback(async () => {
    if (!canRequest) return;
    const sequence = ++requestSequence.current;
    setRequestsLoading(true);
    try {
      const data = await requestApi(conti.id);
      if (sequence !== requestSequence.current) return;
      setRequests(data.requests || []); setRequestsError('');
    } catch (error) {
      if (sequence === requestSequence.current) setRequestsError(error.message);
    } finally {
      if (sequence === requestSequence.current) setRequestsLoading(false);
    }
  }, [conti.id, canRequest]);
  const refreshRequestsRef = useRef(refreshRequests);
  refreshRequestsRef.current = refreshRequests;
  useEffect(() => {
    refreshRequests();
    const refresh = () => { if (document.visibilityState === 'visible') refreshRequests(); };
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); requestSequence.current += 1; };
  }, [refreshRequests]);
  const closeRequests = () => { setRequestsOpen(false); requestsButtonRef.current?.focus(); };
  const [editingItemId, setEditingItemId] = useState(null);
  const [memoDraft, setMemoDraft] = useState('');
  const [memoSaving, setMemoSaving] = useState(false);
  const [memoError, setMemoError] = useState('');
  const [memoEditors, setMemoEditors] = useState({});
  const [cueSaving, setCueSaving] = useState('');
  const [cueError, setCueError] = useState('');
  const [flowSignal, setFlowSignal] = useState(null);
  const [signalSending, setSignalSending] = useState('');
  const [signalError, setSignalError] = useState('');
  const [quickSignalsOpen, setQuickSignalsOpen] = useState(true);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageRef = useRef(null);
  const documentPagesRef = useRef(null);
  const pageRefs = useRef([]);
  const fullscreenRef = useRef(null);
  const thumbsRef = useRef(null);
  const downloadRef = useRef(null);
  const activeThumbRef = useRef(null);
  const zoomRef = useRef(100);
  const zoomDisplayValueRef = useRef(100);
  const zoomLabelRefs = useRef([]);
  const pendingZoomRef = useRef(100);
  const zoomFrameRef = useRef(null);
  const manualZoomRef = useRef(false);
  const pinchRef = useRef(null);
  const pinchScrollFrameRef = useRef(null);
  const scrollFrameRef = useRef(null);
  const memoClientIdRef = useRef('');
  const flowSignalTimerRef = useRef(null);
  const lastFlowSignalIdRef = useRef('');
  const remoteMemoHandlerRef = useRef(onRemoteMemo);
  const memoClientId = () => {
    if (!memoClientIdRef.current) {
      memoClientIdRef.current = globalThis.crypto?.randomUUID?.()
        || `viewer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return memoClientIdRef.current;
  };
  useEffect(() => {
    remoteMemoHandlerRef.current = onRemoteMemo;
  }, [onRemoteMemo]);
  const showFlowSignal = message => {
    if (!message?.signal || !message.label || !message.id || lastFlowSignalIdRef.current === message.id) return;
    lastFlowSignalIdRef.current = message.id;
    if (flowSignalTimerRef.current) clearTimeout(flowSignalTimerRef.current);
    setFlowSignal(message);
    flowSignalTimerRef.current = setTimeout(() => {
      flowSignalTimerRef.current = null;
      setFlowSignal(null);
    }, 3000);
  };
  useEffect(() => {
    const source = new EventSource(`/api/contis/stream?id=${encodeURIComponent(conti.id)}`);
    source.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'cue.updated' || message.type === 'cue.snapshot') {
          const updates = message.type === 'cue.snapshot' ? message.items : [message.cue];
          const latest = latestContiRef.current;
          const next = { ...latest, pages: latest.pages.map(item => ({ ...item, ...(updates || []).find(cue => cue.id === item.id) })) };
          latestContiRef.current = next;
          contiChangeRef.current?.(next);
        } else if (message.type === 'requests.updated') {
          refreshRequestsRef.current();
        } else if (message.type === 'conti.updated' && message.conti) {
          latestContiRef.current = message.conti;
          contiChangeRef.current?.(message.conti);
        } else if (message.type === 'presence.snapshot') {
          setMemoEditors(message.items || {});
        } else if (message.type === 'memo.snapshot') {
          Object.entries(message.items || {}).forEach(([itemId, memo]) => {
            remoteMemoHandlerRef.current?.(conti.id, itemId, memo || '');
          });
        } else if (message.type === 'presence.updated') {
          setMemoEditors(current => ({ ...current, [message.itemId]: message.editors || [] }));
        } else if (message.type === 'memo.updated') {
          remoteMemoHandlerRef.current?.(conti.id, message.itemId, message.memo || '');
        } else if (message.type === 'flow.signal') {
          showFlowSignal(message);
        }
      } catch { /* 잘못된 실시간 메시지는 다음 메시지를 기다린다. */ }
    };
    return () => source.close();
  }, [conti.id]);
  useEffect(() => () => {
    if (flowSignalTimerRef.current) clearTimeout(flowSignalTimerRef.current);
  }, []);
  useEffect(() => {
    if (!editingItemId) return undefined;
    const clientId = memoClientId();
    const announce = active => fetch('/api/contis/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contiId: conti.id, itemId: editingItemId, clientId, active }),
      keepalive: !active,
    }).catch(() => {});
    announce(true);
    const heartbeat = setInterval(() => announce(true), 10000);
    const leave = () => announce(false);
    window.addEventListener('pagehide', leave);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('pagehide', leave);
      announce(false);
    };
  }, [conti.id, editingItemId]);
  // 뷰어의 곡 목록 사이드바 접기 (태블릿·PC). 악보를 넓게 볼 때 쓴다.
  const [thumbsCollapsed, setThumbsCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem('muse-viewer-thumbs-collapsed') === '1') setThumbsCollapsed(true);
    } catch { /* 저장소를 못 쓰면 기본값(펼침) */ }
  }, []);
  const toggleThumbs = () => setThumbsCollapsed(current => {
    const next = !current;
    try { localStorage.setItem('muse-viewer-thumbs-collapsed', next ? '1' : '0'); } catch { /* 무시 */ }
    return next;
  });
  const active = conti.pages[page];
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
  const stepZoom = direction => {
    manualZoomRef.current = true;
    applyZoom(Math.round(zoomRef.current) + direction * 10);
  };
  const scrollToPage = (index, behavior = 'smooth') => {
    const target = pageRefs.current[index];
    const stage = stageRef.current;
    if (!target || !stage) return;
    setPage(index);
    const top = stage.scrollTop + target.getBoundingClientRect().top - stage.getBoundingClientRect().top;
    stage.scrollTo({ top, behavior });
  };
  useEffect(() => {
    const closeMenu = event => {
      if (!downloadRef.current?.contains(event.target)) setDownloadOpen(false);
    };
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, []);
  useEffect(() => {
    const keys = e => {
      if (requestsOpen || tempoItemId) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') scrollToPage(Math.min(conti.pages.length - 1, page + 1));
      if (e.key === 'ArrowLeft') scrollToPage(Math.max(0, page - 1));
    };
    document.addEventListener('keydown',keys);
    return () => document.removeEventListener('keydown',keys);
  }, [conti.pages.length, page, requestsOpen, tempoItemId]);
  // Keep the active desktop thumbnail in view while the document itself scrolls continuously.
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

  // Fit the canonical 1120px sheet to the available stage width. Resize keeps fitting
  // until the user explicitly zooms, which also handles Fold/orientation changes.
  useEffect(() => {
    manualZoomRef.current = false;
    const stage = stageRef.current;
    if (!stage) return undefined;
    const fit = () => {
      if (manualZoomRef.current) return;
      const style = getComputedStyle(stage);
      const available = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2;
      if (available > 0) applyZoom(Math.min(100, available / 1120 * 100));
    };
    const frame = requestAnimationFrame(fit);
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [conti.id, thumbsCollapsed]);

  const updateActivePage = () => {
    if (scrollFrameRef.current) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const stage = stageRef.current;
      if (!stage) return;
      const bestIndex = activePageAt(
        pageRefs.current.map(element => element?.querySelector('.sheet-image')?.getBoundingClientRect()),
        stage.getBoundingClientRect().top,
      );
      setPage(current => current === bestIndex ? current : bestIndex);
    });
  };
  useEffect(() => {
    const observer = new ResizeObserver(updateActivePage);
    if (stageRef.current) observer.observe(stageRef.current);
    pageRefs.current.forEach(element => { if (element) observer.observe(element); });
    updateActivePage();
    return () => observer.disconnect();
  }, [conti.id, conti.pages.length]);
  useEffect(() => () => scrollFrameRef.current && cancelAnimationFrame(scrollFrameRef.current), []);
  useEffect(() => () => zoomFrameRef.current && cancelAnimationFrame(zoomFrameRef.current), []);
  useEffect(() => () => pinchScrollFrameRef.current && cancelAnimationFrame(pinchScrollFrameRef.current), []);

  // One finger remains native scrolling. Two fingers adjust a fine-grained internal zoom.
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
    manualZoomRef.current = true;
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
    manualZoomRef.current = true;
    applyZoom(zoomRef.current * Math.exp(-event.deltaY * .006));
  };
  const beginMemo = (item, index) => {
    const anotherEditor = (memoEditors[item.id] || [])
      .some(editor => editor.clientId !== memoClientId());
    if (anotherEditor) return;
    setPage(index);
    setEditingItemId(item.id);
    setMemoDraft(item.memo || '');
    setMemoError('');
  };
  const saveMemo = async itemId => {
    setMemoSaving(true); setMemoError('');
    try {
      const savedMemo = await onSaveMemo(conti.id, itemId, memoDraft);
      setMemoDraft(savedMemo);
      setEditingItemId(null);
    } catch (error) {
      setMemoError(error.message || '메모를 저장하지 못했어요.');
    } finally {
      setMemoSaving(false);
    }
  };
  const saveCue = async (item, patch) => {
    setCueSaving(item.id);
    setCueError('');
    try {
      await onSaveCue(conti.id, item.id, {
        startInstrument: item.startInstrument || '',
        transitionMode: item.transitionMode || '',
        bpm: item.bpm ?? null,
        timeSignature: item.timeSignature || '',
        ...patch,
      });
      setTempoItemId(null);
    } catch (error) {
      setCueError(error.message || '진행 표시를 저장하지 못했어요.');
    } finally {
      setCueSaving('');
    }
  };
  const sendFlowSignal = async signal => {
    if (signalSending) return;
    setSignalSending(signal);
    setSignalError('');
    try {
      const response = await fetch('/api/contis/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contiId: conti.id, signal }),
      });
      const message = await response.json();
      if (!response.ok) throw new Error(message.message || '진행 알림을 보내지 못했어요.');
      showFlowSignal(message);
    } catch (error) {
      setSignalError(error.message || '진행 알림을 보내지 못했어요.');
    } finally {
      setSignalSending('');
    }
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
        // 뷰어 자체만 Fullscreen top layer에 올려 뒤의 메인 화면이
        // WebKit 합성 과정에서 순간적으로 비치지 않게 한다.
        const target = fullscreenRef.current;
        const request = target?.requestFullscreen || target?.webkitRequestFullscreen;
        if (request) {
          await request.call(target);
          requestAnimationFrame(() => {
            const stage = stageRef.current;
            if (!stage) return;
            // 전체화면 전환 직후 레이아웃과 페인트를 즉시 확정한다.
            stage.getBoundingClientRect();
            updateActivePage();
          });
        }
      }
    } catch { /* 브라우저가 전체화면 요청을 거부하면 현재 전체 화면형 모달을 유지한다. */ }
  };
  return <>
  <ModalShell onClose={tempoItemId ? () => setTempoItemId(null) : requestsOpen ? closeRequests : onClose} viewer modalRef={fullscreenRef}>
    <header className="viewer-header">
      <div className="viewer-title">
        <button onClick={onClose} aria-label="닫기"><ArrowLeft/></button>
        <button
          className="viewer-thumbs-toggle"
          onClick={toggleThumbs}
          title={thumbsCollapsed ? '곡 목록 펼치기' : '곡 목록 접기'}
          aria-label={thumbsCollapsed ? '곡 목록 펼치기' : '곡 목록 접기'}
          aria-expanded={!thumbsCollapsed}
        >{thumbsCollapsed ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}</button>
        <div><span>{dateKo(conti.date, true)}</span><h2>{active.title || conti.title}</h2></div>
      </div>
      <div className="viewer-tools">
        <div className="zoom-control">
          <button onClick={() => stepZoom(-1)} aria-label="축소"><Minus/></button>
          <span ref={element => { zoomLabelRefs.current[0] = element; }}>{zoomDisplayValueRef.current}%</span>
          <button onClick={() => stepZoom(1)} aria-label="확대"><ZoomIn/></button>
        </div>
        <div className="viewer-download" ref={downloadRef}>
          <button title="악보 다운로드" aria-expanded={downloadOpen} onClick={() => setDownloadOpen(value => !value)}><Download/></button>
          {downloadOpen && <div className="viewer-download-menu">
            <a href={`/api/contis/image?contiId=${encodeURIComponent(conti.id)}&itemId=${encodeURIComponent(active.id)}`} onClick={() => setDownloadOpen(false)}>
              <FileImage/><span><b>현재 악보 원본</b><small>{active.title}</small></span>
            </a>
            <a href={`/api/contis/pdf?id=${encodeURIComponent(conti.id)}`} onClick={() => setDownloadOpen(false)}>
              <Download/><span><b>콘티 PDF 일괄 다운로드</b><small>{conti.pages.length}곡 · {conti.pages.length}페이지</small></span>
            </a>
          </div>}
        </div>
        {canShare && <button title="콘티 공유" className="viewer-share-button" onClick={() => setShareOpen(true)}><Share2/></button>}
        {canRequest && <button
          ref={requestsButtonRef}
          className="viewer-request-button"
          title={pendingRequestCount ? `변경 요청 · 승인 대기 ${pendingRequestCount}건` : '변경 요청'}
          aria-label={pendingRequestCount ? `변경 요청 · 승인 대기 ${pendingRequestCount}건` : '변경 요청'}
          aria-haspopup="dialog"
          aria-expanded={requestsOpen}
          onClick={() => { setRequestsOpen(true); refreshRequests(); }}
        ><MessageSquarePlus/>{pendingRequestCount > 0 && <b aria-hidden="true">{pendingRequestCount > 99 ? '99+' : pendingRequestCount}</b>}</button>}
        <button title={isFullscreen ? '전체화면 종료' : '전체화면'} onClick={toggleFullscreen}>{isFullscreen ? <Minimize2/> : <Maximize2/>}</button>
        <button onClick={onClose} className="viewer-desktop-only" aria-label="닫기"><X/></button>
      </div>
    </header>
    <Metronome pages={conti.pages} page={page}/>
    {tempoItemId && <ModalShell onClose={() => setTempoItemId(null)}>
      <div className="tempo-modal" role="dialog" aria-modal="true" aria-label="박자와 BPM 설정">
      <header className="modal-header"><h2>박자와 BPM 설정</h2><button type="button" onClick={() => setTempoItemId(null)} aria-label="닫기"><X/></button></header>
      <TempoFields value={tempoDraft} disabled={Boolean(cueSaving)} onChange={patch => setTempoDraft(current => ({ ...current, ...patch }))} inherited={resolveTempo(conti.pages, conti.pages.findIndex(item => item.id === tempoItemId)).inherited} inheritedBpm={resolveTempo(conti.pages, conti.pages.findIndex(item => item.id === tempoItemId)).bpm}/>
      {cueError && <p role="alert">{cueError}</p>}
      <button type="button" className="primary-button" disabled={Boolean(cueSaving)} onClick={() => { const item = conti.pages.find(item => item.id === tempoItemId); if (item) saveCue(item, tempoDraft); }}>{cueSaving ? '저장 중…' : '저장'}</button>
      </div>
    </ModalShell>}
    {canSendSignals && flowSignals.length > 0 && <div className="viewer-flow-controls" aria-label="실시간 진행 알림">
      <span>진행 알림</span>
      <div data-count={flowSignals.length}>{flowSignals.map(({ id, label, shortLabel, icon, color }) => <button
        key={id}
        type="button"
        style={{ '--signal-color': color }}
        disabled={Boolean(signalSending)}
        onClick={() => sendFlowSignal(id)}
        title={label}
      ><FlowSignalIcon name={icon}/><b>{shortLabel || label}</b>{signalSending === id && <i/>}</button>)}</div>
      {signalError && <em role="alert">{signalError}</em>}
    </div>}
    <div className={`viewer-body ${thumbsCollapsed ? 'thumbs-collapsed' : ''}`}>
      {flowSignal && <div key={flowSignal.id} className="viewer-flow-alert" style={{ '--signal-color': flowSignal.color }} role="alert" aria-live="assertive">
        <FlowSignalIcon name={flowSignal.icon}/>
        <div><b>{flowSignal.label}</b><span>{flowSignal.sender?.displayName || '인도자'}님의 진행 알림</span></div>
      </div>}
      {canSendSignals && quickSignalsEnabled && flowSignals.length > 0 && <div
        className={`viewer-flow-quick ${quickSignalsOpen ? 'open' : 'collapsed'}`}
        data-position={quickSignalsPosition === 'right' ? 'right' : 'left'}
        aria-label="빠른 진행 알림"
      >
        <div className="quick-signal-list" aria-hidden={!quickSignalsOpen}>
          {flowSignals.map(({ id, label, icon, color }) => <button
            key={id}
            type="button"
            className="quick-signal-button"
            style={{ '--signal-color': color }}
            disabled={Boolean(signalSending)}
            tabIndex={quickSignalsOpen ? 0 : -1}
            onClick={() => sendFlowSignal(id)}
            aria-label={label}
            title={label}
          ><FlowSignalIcon name={icon}/>{signalSending === id && <i/>}</button>)}
        </div>
        <button
          type="button"
          className="quick-signal-toggle"
          onClick={() => setQuickSignalsOpen(current => !current)}
          aria-expanded={quickSignalsOpen}
          aria-label={quickSignalsOpen ? '빠른 진행 알림 접기' : '빠른 진행 알림 펼치기'}
          title={quickSignalsOpen ? '퀵버튼 접기' : '퀵버튼 펼치기'}
        >{quickSignalsOpen ? <ChevronDown/> : <ChevronUp/>}</button>
      </div>}
      <aside className="viewer-thumbs" ref={thumbsRef}>
        <div className="thumb-heading"><span>곡 목록</span><b>{conti.pages.length}곡</b></div>
        {conti.pages.map((p,i) => <button
          key={p.id}
          ref={page === i ? activeThumbRef : null}
          className={page===i?'active':''}
          onClick={() => scrollToPage(i)}
        >
          <span className="thumb-number">{i+1}</span><img src={p.image} alt="" loading="lazy" decoding="async"/><div><b>{p.title}</b><span>{p.key && `${p.key} Key`}</span></div>
        </button>)}
      </aside>
      <main className="document-stage" ref={stageRef} onScroll={updateActivePage} onWheel={onWheel} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
        <div className="document-pages" ref={documentPagesRef} style={{'--zoom': 1}}>
          {conti.pages.map((item, index) => {
            const remoteEditors = (memoEditors[item.id] || [])
              .filter(editor => editor.clientId !== memoClientId());
            const editorNames = [...new Set(remoteEditors.map(editor => editor.displayName).filter(Boolean))];
            const editorLabel = editorNames.length > 1
              ? `${editorNames[0]}님 외 ${editorNames.length - 1}명이 메모를 수정 중이에요.`
              : `${editorNames[0] || '다른 사용자'}님이 메모를 수정 중이에요.`;
            const memoEditingBlocked = remoteEditors.length > 0;
            const nextPage = conti.pages[index + 1];
            /* 종이 위/아래 가장자리 색: 앞 곡에서 들어오는 전환과 이 곡에서 나가는 전환. */
            const cueIn = conti.pages[index - 1]?.transitionMode;
            const cueOut = nextPage ? item.transitionMode : '';
            return <React.Fragment key={item.id}>
            <article
              className="paper"
              data-cue-in={cueIn || undefined}
              data-cue-out={cueOut || undefined}
              ref={element => { pageRefs.current[index] = element; }}
            >
            <div className="sheet-heading">
              <div className="sheet-cues">
                {item.key && <b className="sheet-key">{item.key}<small>KEY</small></b>}
                {canEditCues ? <>
                  <select aria-label="시작 악기" disabled={cueSaving === item.id} value={item.startInstrument || ''} onChange={event => saveCue(item, { startInstrument: event.target.value })}><option value="">시작 미정</option>{selectableInstruments(instrumentPresets, item.startInstrument).map(instrument => <option key={instrument.id} value={instrument.id}>{instrument.label} 시작</option>)}</select>
                  <select aria-label="다음 곡 전환" disabled={cueSaving === item.id} value={item.transitionMode || ''} onChange={event => saveCue(item, { transitionMode: event.target.value })}><option value="">전환 미정</option><option value="continue">이어서</option><option value="stop">끊고</option></select>
                  <button type="button" className="sheet-tempo-button" onClick={() => { setTempoItemId(item.id); setTempoDraft({ bpm: item.bpm ?? null, timeSignature: item.timeSignature || '' }); setCueError(''); }}>{resolveTempo(conti.pages, index).bpm ? `${resolveTempo(conti.pages, index).bpm} BPM` : 'BPM 설정'}</button>
                </> : <>
                  {item.startInstrument && <span>{instrumentLabel(item.startInstrument, instrumentPresets, item.startInstrumentLabel)} 시작</span>}
                  {item.transitionMode && <span>{item.transitionMode === 'stop' ? '끊고' : '이어서'}</span>}
                  {resolveTempo(conti.pages, index).bpm && <span>{resolveTempo(conti.pages, index).bpm} BPM</span>}
                </>}
              </div>
              <div className="sheet-heading-copy"><h1>{item.title}</h1>{conti.leader && <span>인도 {conti.leader}</span>}</div>
            </div>
            {cueError && cueSaving !== item.id && page === index && <div className="sheet-cue-error">{cueError}</div>}
            <div className="sheet-image"><img src={item.image} alt={item.title} loading={index < 2 ? 'eager' : 'lazy'} decoding="async"/></div>
            {(item.memo?.trim() || conti.memo?.trim() || canEditMemo || memoEditingBlocked) && <div className="sheet-memos open">
              {editingItemId === item.id ? <div className="sheet-memo-editor">
                <b>곡 메모</b>
                <div><textarea autoFocus value={memoDraft} onChange={event => setMemoDraft(event.target.value)} placeholder="이 악보에서 확인할 메모를 입력하세요."/><span>{memoError}</span><div><button className="secondary-button" onClick={() => { setEditingItemId(null); setMemoDraft(item.memo || ''); }}>취소</button><button className="primary-button" disabled={memoSaving} onClick={() => saveMemo(item.id)}>{memoSaving ? '저장 중…' : '저장'}</button></div></div>
              </div> : item.memo?.trim() ? <div><b>곡 메모</b><span>{item.memo}</span>{canEditMemo && <button className="memo-edit-button" disabled={memoEditingBlocked} title={memoEditingBlocked ? editorLabel : undefined} onClick={() => beginMemo(item, index)}>수정</button>}</div> : canEditMemo ? <button className="memo-add-button" disabled={memoEditingBlocked} title={memoEditingBlocked ? editorLabel : undefined} onClick={() => beginMemo(item, index)}><Plus/> 악보 메모 추가</button> : null}
              {memoEditingBlocked && <div className="sheet-memo-presence" role="status" aria-live="polite"><b>편집 중</b><span>{editorLabel}</span></div>}
              {conti.memo?.trim() && <div><b>콘티 메모</b><span>{conti.memo}</span></div>}
            </div>}
          </article>
          {nextPage && <SongTransition mode={item.transitionMode} nextTitle={nextPage.title}/>}
          </React.Fragment>;
          })}
        </div>
      </main>
      <div className="viewer-mobile-controls">
        <button onClick={() => stepZoom(-1)} aria-label="축소"><Minus/></button>
        <span ref={element => { zoomLabelRefs.current[1] = element; }}>{zoomDisplayValueRef.current}%</span>
        <button onClick={() => stepZoom(1)} aria-label="확대"><ZoomIn/></button>
        <em>{page + 1} / {conti.pages.length}</em>
      </div>
    </div>
    {requestsOpen && <ChangeRequests
      conti={conti} currentUser={currentUser} songs={songs} initialItemId={active.id}
      requests={requests} loading={requestsLoading} loadError={requestsError}
      onRefresh={refreshRequests} onContiChange={onContiChange} onClose={closeRequests}
    />}
  </ModalShell>
  {shareOpen && <ShareModal conti={conti} onClose={() => setShareOpen(false)}/>}
  </>;
}
