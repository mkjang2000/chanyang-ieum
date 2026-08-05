"use client";

import React, { useEffect, useRef, useState } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Archive, ArrowLeft, CalendarDays, Check, ChevronDown, ChevronLeft,
  ChevronRight, CirclePlus, Copy, Download, ExternalLink, FileImage, Folder,
  FolderPlus, GripVertical, Grid2X2, ImagePlus, ListMusic, Maximize2, Menu, Minimize2, Minus, MoreHorizontal,
  FileText,
  Link2, LogOut, Music2, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings,
  Share2, ShieldCheck, Trash2, Upload, UserPlus, UserRound, X, ZoomIn
} from 'lucide-react';
import SongTransition from './SongTransition.jsx';
import FlowSignalIcon from './FlowSignalIcon.jsx';
import { DEFAULT_FLOW_SIGNALS } from './flowSignalConfig.js';

const SERVICE_TYPES = [
  { id: 'sunday-morning', label: '주일낮예배', color: '#f97316', short: '낮', defaultTime: '10:50', active: true },
  { id: 'sunday-praise', label: '주일찬양예배', color: '#8b5cf6', short: '찬양', defaultTime: '15:45', active: true },
  { id: 'wednesday', label: '수요예배', color: '#0ea5e9', short: '수', defaultTime: '19:45', active: true },
  { id: 'friday', label: '금요예배', color: '#10b981', short: '금', defaultTime: '19:45', active: true },
  { id: 'other', label: '기타예배', color: '#64748b', short: '기타', defaultTime: '', active: true },
];
const DEFAULT_INSTRUMENTS = [
  { id: 'piano', label: '피아노', sortOrder: 10, active: true },
  { id: 'drums', label: '드럼', sortOrder: 20, active: true },
  { id: 'acoustic-guitar', label: '통기타', sortOrder: 30, active: true },
  { id: 'electric-guitar', label: '일렉기타', sortOrder: 40, active: true },
  { id: 'bass', label: '베이스', sortOrder: 50, active: true },
];
const instrumentLabel = (value, presets = DEFAULT_INSTRUMENTS, explicit = '') => (
  explicit || presets.find(instrument => instrument.id === value)?.label
  || ({ piano: '피아노', drums: '드럼' }[value]) || value
);
const selectableInstruments = (presets, currentValue = '') => (
  presets.filter(instrument => instrument.active || instrument.id === currentValue)
);
const serviceDefaultTime = (serviceType, presets = SERVICE_TYPES) => (
  presets.find(preset => preset.id === serviceType)?.defaultTime || ''
);
const iso = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dateKo = (value, full = false) => {
  const d = new Date(`${value}T00:00:00`);
  return full
    ? `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`
    : `${d.getMonth() + 1}월 ${d.getDate()}일`;
};
const formatBytes = value => {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
};
const TODAY = iso(new Date());
const DEFAULT_SETTINGS = {
  system: { churchName: '', defaultServiceType: 'sunday-morning' },
  preferences: {
    defaultMode: 'regular', viewerZoom: 100, showNotes: true,
    quickSignalsEnabled: true, quickSignalsPosition: 'left',
  },
};
let openModalCount = 0;

function usePersistentState(key, initial) {
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key));
      if (stored) setValue(stored);
    } catch { /* use the initial demo data */ }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* uploaded images may exceed browser quota */ }
  }, [key, ready, value]);
  return [value, setValue, ready];
}

export default function App() {
  const [auth, setAuth] = useState({ loading: true, setupRequired: false, user: null });
  const [selectedEvent, setSelectedEvent] = useState('');
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const todayDate = new Date(`${TODAY}T00:00:00`);
  const [calendarMonth, setCalendarMonth] = useState(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
  const [contis, setContis, contisReady] = usePersistentState('muse-contis', []);
  const [events, setEvents, eventsReady] = usePersistentState('muse-events', []);
  const [songs, setSongs] = useState([]);
  const [leaderOptions, setLeaderOptions] = useState([]);
  const [servicePresets, setServicePresets] = useState(SERVICE_TYPES);
  const [instrumentPresets, setInstrumentPresets] = useState(DEFAULT_INSTRUMENTS);
  const [flowSignals, setFlowSignals] = useState(DEFAULT_FLOW_SIGNALS);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [serverReady, setServerReady] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  // 태블릿·PC 에서 사이드바를 접어 본문을 넓게 쓰는 상태. 브라우저에 기억시킨다.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const viewerHistoryRef = useRef({ active: false, token: '' });

  useEffect(() => {
    if (modal?.type !== 'viewer') return undefined;
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const syncViewport = () => {
      root.style.setProperty('--visual-viewport-top', `${viewport?.offsetTop || 0}px`);
      root.style.setProperty('--visual-viewport-left', `${viewport?.offsetLeft || 0}px`);
      root.style.setProperty('--visual-viewport-width', `${viewport?.width || window.innerWidth}px`);
      root.style.setProperty('--visual-viewport-height', `${viewport?.height || window.innerHeight}px`);
    };
    syncViewport();
    viewport?.addEventListener('resize', syncViewport);
    viewport?.addEventListener('scroll', syncViewport);
    window.addEventListener('orientationchange', syncViewport);
    return () => {
      viewport?.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('scroll', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
    };
  }, [modal?.type]);

  useEffect(() => {
    try {
      if (localStorage.getItem('muse-sidebar-collapsed') === '1') setSidebarCollapsed(true);
    } catch { /* 저장소를 못 쓰면 기본값(펼침)으로 둔다 */ }
  }, []);
  const toggleSidebar = () => setSidebarCollapsed(current => {
    const next = !current;
    try { localStorage.setItem('muse-sidebar-collapsed', next ? '1' : '0'); } catch { /* 무시 */ }
    return next;
  });

  // 모바일의 시스템 뒤로가기는 사이트를 떠나는 대신 현재 뷰어를 닫는다.
  // 화면 안의 닫기 버튼도 동일한 history 항목을 소비해 뒤로가기가 중복되지 않는다.
  useEffect(() => {
    if (modal?.type !== 'viewer') return undefined;
    const token = `viewer-${modal.conti.id}-${Date.now()}`;
    window.history.pushState({ ...window.history.state, __chanyangViewer: token }, '');
    viewerHistoryRef.current = { active: true, token };
    const handlePopState = () => {
      if (!viewerHistoryRef.current.active) return;
      viewerHistoryRef.current = { active: false, token: '' };
      setModal(current => current?.type === 'viewer' ? null : current);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [modal?.type, modal?.conti?.id]);

  const closeViewer = () => {
    const current = viewerHistoryRef.current;
    if (current.active && window.history.state?.__chanyangViewer === current.token) {
      window.history.back();
      return;
    }
    viewerHistoryRef.current = { active: false, token: '' };
    setModal(null);
  };

  const selectedContis = contis
    .filter(c => c.date === selectedDate)
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  const eventsOnSelectedDate = events.filter(event => selectedDate >= event.start && selectedDate <= event.end);
  const suggestedEvent = eventsOnSelectedDate[0] || null;
  const canEdit = ['admin', 'leader'].includes(auth.user?.role);
  const canEditMemo = ['admin', 'leader', 'accompanist'].includes(auth.user?.role);
  const isAdmin = auth.user?.role === 'admin';
  const canManageConti = conti => isAdmin || (
    auth.user?.role === 'leader'
    && conti.ownerUserId === auth.user.id
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/status', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || '로그인 상태를 확인하지 못했어요.');
        if (!cancelled) setAuth({ loading: false, setupRequired: Boolean(data.setupRequired), user: data.user || null });
      })
      .catch(() => {
        if (!cancelled) setAuth({ loading: false, setupRequired: false, user: null, error: '서버에 연결하지 못했어요.' });
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!auth.user) return;
    let cancelled = false;
    let lastRefresh = Date.now();
    const refreshSession = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/api/auth/status', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) return;
        lastRefresh = Date.now();
        if (!data.user) {
          setAuth({ loading: false, setupRequired: Boolean(data.setupRequired), user: null });
          return;
        }
        setAuth(current => ({ ...current, user: data.user }));
      } catch {
        // 네트워크가 잠시 끊긴 경우 현재 화면을 유지하고 다음 주기에 다시 시도한다.
      }
    };
    const refreshIfDue = () => {
      if (Date.now() - lastRefresh >= 12 * 60 * 60 * 1000) refreshSession();
    };
    const timer = window.setInterval(refreshSession, 12 * 60 * 60 * 1000);
    window.addEventListener('focus', refreshIfDue);
    document.addEventListener('visibilitychange', refreshIfDue);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshIfDue);
      document.removeEventListener('visibilitychange', refreshIfDue);
    };
  }, [auth.user?.id]);

  useEffect(() => {
    if (!contisReady || !eventsReady || !auth.user) return;
    let cancelled = false;
    const load = async () => {
      try {
        let response = await fetch('/api/bootstrap', { cache: 'no-store' });
        let data = await response.json();
        if (!response.ok) throw new Error(data.message || '서버 저장소를 불러오지 못했어요.');

        if (!data.contis.length && !data.events.length) {
          const localContis = contis.filter(item => !['c1', 'c2', 'c3'].includes(item.id));
          const referencedEvents = new Set(localContis.map(item => item.eventId).filter(Boolean));
          const localEvents = events.filter(item => !['e1', 'e2'].includes(item.id) || referencedEvents.has(item.id));
          if (localContis.length || localEvents.length) {
            response = await fetch('/api/bootstrap', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contis: localContis, events: localEvents }),
            });
            data = await response.json();
            if (!response.ok) throw new Error(data.message || '기존 데이터를 서버로 옮기지 못했어요.');
          }
        }
        if (cancelled) return;
        setContis(data.contis || []);
        setEvents(data.events || []);
        setSongs(data.songs || []);
        setLeaderOptions(data.leaderOptions || []);
        setServicePresets(data.servicePresets?.length ? data.servicePresets : SERVICE_TYPES);
        setInstrumentPresets(Array.isArray(data.instrumentPresets) ? data.instrumentPresets : DEFAULT_INSTRUMENTS);
        setFlowSignals(Array.isArray(data.flowSignals) ? data.flowSignals : DEFAULT_FLOW_SIGNALS);
        const firstEvent = data.events?.[0];
        if (firstEvent) setSelectedEvent(current => current || firstEvent.id);
        setServerReady(true);
      } catch (error) {
        if (cancelled) return;
        setServerReady(true);
        notify(`${error.message} 브라우저 임시 저장본을 표시합니다.`);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [contisReady, eventsReady, auth.user?.id]);

  useEffect(() => {
    if (!auth.user) return;
    let cancelled = false;
    fetch('/api/settings', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || '환경 설정을 불러오지 못했어요.');
        if (cancelled) return;
        const next = {
          system: { ...DEFAULT_SETTINGS.system, ...(data.system || {}) },
          preferences: { ...DEFAULT_SETTINGS.preferences, ...(data.preferences || {}) },
        };
        setSettings(next);
      })
      .catch(error => !cancelled && notify(error.message));
    return () => { cancelled = true; };
  }, [auth.user?.id]);

  useEffect(() => {
    if (!auth.user) return;
    const churchName = settings.system.churchName.trim();
    document.title = churchName
      ? `${churchName} — 찬양이음`
      : '찬양이음 — 찬양팀 콘티 관리';
  }, [auth.user?.id, settings.system.churchName]);

  useEffect(() => {
    if (!auth.user) return;
    let cancelled = false;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/api/bootstrap', { cache: 'no-store' });
        const data = await response.json();
        if (response.status === 401) {
          if (!cancelled) setAuth({ loading: false, setupRequired: false, user: null });
          return;
        }
        if (!response.ok || cancelled) return;
        setContis(data.contis || []);
        setEvents(data.events || []);
        setSongs(data.songs || []);
        setLeaderOptions(data.leaderOptions || []);
        setServicePresets(data.servicePresets?.length ? data.servicePresets : SERVICE_TYPES);
        setInstrumentPresets(Array.isArray(data.instrumentPresets) ? data.instrumentPresets : DEFAULT_INSTRUMENTS);
        setFlowSignals(Array.isArray(data.flowSignals) ? data.flowSignals : DEFAULT_FLOW_SIGNALS);
      } catch {
        // Keep the last known data and retry on the next focus/interval.
      }
    };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [auth.user?.id]);

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  };
  const refreshSongs = async () => {
    const response = await fetch('/api/songs', { cache: 'no-store' });
    const data = await response.json();
    if (response.ok) setSongs(data.songs || []);
  };
  const saveConti = async (conti) => {
    const response = await fetch('/api/contis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conti),
    });
    const saved = await response.json();
    if (!response.ok) throw new Error(saved.message || '콘티를 저장하지 못했어요.');
    setContis(current => current.some(c => c.id === saved.id)
      ? current.map(c => c.id === saved.id ? saved : c)
      : [...current, saved]);
    setSelectedDate(saved.date);
    setModal(null);
    await refreshSongs();
    notify('콘티와 악보 원본을 서버에 저장했어요');
  };
  const deleteContiById = async id => {
    const response = await fetch(`/api/contis?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '콘티를 삭제하지 못했어요.');
    setContis(current => current.filter(item => item.id !== id));
    setModal(null);
    await refreshSongs();
    notify('콘티를 삭제했어요');
  };
  const saveEvent = async event => {
    const response = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    const saved = await response.json();
    if (!response.ok) throw new Error(saved.message || '행사를 저장하지 못했어요.');
    setEvents(current => current.some(item => item.id === saved.id)
      ? current.map(item => item.id === saved.id ? saved : item)
      : [...current, saved]);
    selectEvent(saved.id);
    setModal(null);
    notify(event.id && events.some(item => item.id === event.id) ? '행사를 수정했어요' : '새 행사를 만들었어요');
  };
  const deleteEventById = async id => {
    const response = await fetch(`/api/events?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '행사를 삭제하지 못했어요.');
    const remaining = events.filter(item => item.id !== id);
    setEvents(remaining);
    setContis(current => current.filter(item => item.eventId !== id));
    setSelectedEvent(remaining[0]?.id || '');
    setModal(null);
    notify('행사와 행사 안의 콘티를 삭제했어요');
  };
  const applyPageMemoUpdate = (contiId, itemId, memo) => {
    const applyMemo = conti => conti.id !== contiId ? conti : {
      ...conti,
      pages: conti.pages.map(page => page.id === itemId ? { ...page, memo } : page),
    };
    setContis(current => current.map(applyMemo));
    setModal(current => current?.type === 'viewer' && current.conti.id === contiId
      ? { ...current, conti: applyMemo(current.conti) }
      : current);
  };
  const savePageMemo = async (contiId, itemId, memo) => {
    const response = await fetch('/api/contis/memo', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contiId, itemId, memo }),
    });
    const saved = await response.json();
    if (!response.ok) throw new Error(saved.message || '악보 메모를 저장하지 못했어요.');
    applyPageMemoUpdate(contiId, itemId, saved.memo);
    notify('악보 메모를 저장했어요');
    return saved.memo;
  };
  const savePageCue = async (contiId, itemId, cue) => {
    const response = await fetch('/api/contis/cue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contiId, itemId, ...cue }),
    });
    const saved = await response.json();
    if (!response.ok) throw new Error(saved.message || '악보 진행 표시를 저장하지 못했어요.');
    const applyCue = conti => conti.id !== contiId ? conti : {
      ...conti,
      pages: conti.pages.map(page => page.id === itemId ? {
        ...page,
        startInstrument: saved.startInstrument,
        startInstrumentLabel: saved.startInstrumentLabel,
        transitionMode: saved.transitionMode,
      } : page),
    };
    setContis(current => current.map(applyCue));
    setModal(current => current?.type === 'viewer' && current.conti.id === contiId
      ? { ...current, conti: applyCue(current.conti) }
      : current);
    return saved;
  };
  const logoutUser = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setContis([]);
    setEvents([]);
    setSongs([]);
    setLeaderOptions([]);
    setServicePresets(SERVICE_TYPES);
    setInstrumentPresets(DEFAULT_INSTRUMENTS);
    setFlowSignals(DEFAULT_FLOW_SIGNALS);
    setSettings(DEFAULT_SETTINGS);
    setModal(null);
    setAuth(current => ({ loading: false, setupRequired: false, user: null, error: current.error }));
  };
  const selectEvent = (id) => {
    const event = events.find(e => e.id === id);
    setSelectedEvent(id);
    if (event) {
      setSelectedDate(event.start);
      const d = new Date(`${event.start}T00:00:00`);
      setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    setMobileMenu(false);
  };

  if (auth.loading) return <AuthLoading />;
  if (!auth.user) {
    return <AuthScreen
      setupRequired={auth.setupRequired}
      initialError={auth.error}
      onAuthenticated={user => setAuth({ loading: false, setupRequired: false, user })}
    />;
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        events={events} selectedEvent={suggestedEvent?.id || ''}
        contiCount={contis.length} onCalendar={() => setMobileMenu(false)} onEvent={selectEvent}
        onCreateEvent={() => setModal({ type: 'event' })}
        onEditEvent={event => setModal({ type: 'event', event })}
        onArchive={() => setModal({ type: 'archive' })}
        onSongs={() => setModal({ type: 'songs' })}
        canEdit={canEdit}
        isAdmin={isAdmin}
        onAdmin={() => window.location.assign('/admin')}
        onSettings={() => setModal({ type: 'settings' })}
        churchName={settings.system.churchName}
        open={mobileMenu} onClose={() => setMobileMenu(false)}
        collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar}
      />

      <main className="main">
        <header className="topbar">
          <div className="mobile-brand">
            <button className="icon-button" onClick={() => setMobileMenu(true)} aria-label="메뉴"><Menu size={21}/></button>
            <Logo compact churchName={settings.system.churchName}/>
          </div>
          <div className="crumb">
            <button
              className="sidebar-toggle"
              onClick={toggleSidebar}
              title={sidebarCollapsed ? '메뉴 펼치기' : '메뉴 접기'}
              aria-label={sidebarCollapsed ? '메뉴 펼치기' : '메뉴 접기'}
              aria-expanded={!sidebarCollapsed}
            >{sidebarCollapsed ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}</button>
            <span>콘티 달력</span>
          </div>
          <div className="account-menu">
            <div><b>{auth.user.displayName}</b><span>{roleLabel(auth.user.role)}</span></div>
            {isAdmin && <button title="관리자" onClick={() => window.location.assign('/admin')}><ShieldCheck/></button>}
            <button title="로그아웃" onClick={logoutUser}><LogOut/></button>
          </div>
        </header>

        <div className="content">
          <section className="page-intro">
            <div>
              <h1>콘티 달력</h1>
              <p>일반 예배와 행사 콘티를 날짜별로 한 번에 확인하세요.</p>
            </div>
            {canEdit && <button className="primary-button" disabled={!serverReady} onClick={() => setModal({ type: 'conti' })}><Plus size={18}/> 새 콘티</button>}
          </section>

          <section className="workspace-grid">
            <div className="calendar-panel card">
              <Calendar
                month={calendarMonth} setMonth={setCalendarMonth}
                selected={selectedDate} setSelected={setSelectedDate}
                contis={contis} events={events}
                servicePresets={servicePresets}
              />
            </div>
            <aside className="day-panel">
              <div className="day-heading">
                <div className="date-tile"><b>{new Date(`${selectedDate}T00:00:00`).getDate()}</b><span>{'일월화수목금토'[new Date(`${selectedDate}T00:00:00`).getDay()]}</span></div>
                <div><span>선택한 날짜</span><h2>{dateKo(selectedDate, true)}</h2></div>
              </div>
              {selectedContis.length ? (
                <div className="conti-list">
                  {selectedContis.map(c => <ContiCard key={c.id} conti={c} onView={() => setModal({ type: 'viewer', conti: c })} onEdit={canManageConti(c) ? () => setModal({ type: 'conti', conti: c }) : null}/>)}
                </div>
              ) : (
                <div className="empty-card">
                  <div className="empty-illustration"><Music2 size={27}/><span/><i/></div>
                  <h3>아직 등록된 콘티가 없어요</h3>
                  <p>이 날짜의 첫 번째 콘티를 만들어 보세요.</p>
                  {canEdit && <button className="text-button" onClick={() => setModal({ type: 'conti' })}><CirclePlus size={17}/> 콘티 등록하기</button>}
                </div>
              )}
            </aside>
          </section>

          <RecentSection
            contis={contis}
            servicePresets={servicePresets}
            onView={c => setModal({ type: 'viewer', conti: c })}
            onAll={() => setModal({ type: 'archive', scope: 'upcoming' })}
          />
        </div>
      </main>

      <nav className="mobile-nav">
        <button className="active" onClick={() => { setMobileMenu(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><CalendarDays/><span>콘티 달력</span></button>
        <button onClick={() => setMobileMenu(true)}><Folder/><span>행사 관리</span></button>
        <button className="mobile-add" disabled={!canEdit} onClick={() => setModal({ type: 'conti' })}><Plus/></button>
        <button onClick={() => setModal({ type: 'archive' })}><Archive/><span>보관함</span></button>
        <button onClick={() => setModal({ type: 'settings' })}><Settings/><span>설정</span></button>
      </nav>

      {modal?.type === 'conti' && <ContiEditor
        initial={modal.conti}
        mode={modal.conti?.mode || (suggestedEvent ? 'event' : 'regular')}
        eventId={modal.conti?.eventId || suggestedEvent?.id || selectedEvent}
        selectedDate={selectedDate} events={events} songs={songs}
        currentUser={auth.user}
        isAdmin={isAdmin}
        leaderOptions={leaderOptions}
        defaultServiceType={settings.system.defaultServiceType}
        servicePresets={servicePresets}
        instrumentPresets={instrumentPresets}
        onClose={() => setModal(null)} onSave={saveConti}
        onDelete={modal.conti ? () => deleteContiById(modal.conti.id) : null}
      />}
      {modal?.type === 'event' && <EventEditor
        initial={modal.event}
        onClose={() => setModal(null)}
        onSave={saveEvent}
        onDelete={modal.event ? () => deleteEventById(modal.event.id) : null}
      />}
      {modal?.type === 'songs' && <LibraryModal songs={songs} onClose={() => setModal(null)} />}
      {modal?.type === 'archive' && <ArchiveModal
        contis={contis}
        initialScope={modal.scope || 'past'}
        onClose={() => setModal(null)}
        onView={conti => setModal({ type: 'viewer', conti })}
      />}
      {modal?.type === 'settings' && <SettingsModal
        currentUser={auth.user}
        settings={settings}
        onApply={next => setSettings(current => ({
          system: { ...current.system, ...(next.system || {}) },
          preferences: { ...current.preferences, ...(next.preferences || {}) },
        }))}
        onUserChange={user => setAuth(current => ({ ...current, user }))}
        onLogout={logoutUser}
        onClose={() => setModal(null)}
      />}
      {modal?.type === 'viewer' && <DocumentViewer
        conti={modal.conti}
        canEditMemo={canEditMemo}
        canEditCues={canManageConti(modal.conti)}
        canSendSignals={canManageConti(modal.conti)}
        flowSignals={flowSignals}
        instrumentPresets={instrumentPresets}
        quickSignalsEnabled={settings.preferences.quickSignalsEnabled}
        quickSignalsPosition={settings.preferences.quickSignalsPosition}
        canShare={canEditMemo}
        onSaveMemo={savePageMemo}
        onRemoteMemo={applyPageMemoUpdate}
        onSaveCue={savePageCue}
        onClose={closeViewer}
      />}
      {toast && <div className="toast"><Check size={17}/>{toast}</div>}
    </div>
  );
}

const roleLabel = role => ({
  admin: '관리자',
  leader: '인도자',
  accompanist: '반주자',
  member: '성도',
}[role] || role);

function AuthLoading() {
  return <div className="auth-page"><div className="auth-card auth-loading"><Logo/><div className="spinner"/><p>로그인 상태를 확인하고 있어요.</p></div></div>;
}

function AuthScreen({ setupRequired, initialError, onAuthenticated }) {
  const [form, setForm] = useState({ username: '', displayName: '', password: '', confirmPassword: '' });
  const [error, setError] = useState(initialError || '');
  const [submitting, setSubmitting] = useState(false);
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault();
    setError('');
    if (setupRequired && form.password !== form.confirmPassword) {
      setError('비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(setupRequired ? '/api/auth/setup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '로그인하지 못했어요.');
      onAuthenticated(data.user);
    } catch (submitError) {
      setError(submitError.message || '서버에 연결하지 못했어요.');
      setSubmitting(false);
    }
  };
  return <div className="auth-page">
    <form className="auth-card" onSubmit={submit}>
      <Logo/>
      <div className="auth-heading">
        <h1>{setupRequired ? '첫 관리자 설정' : '찬양이음 로그인'}</h1>
        <p>{setupRequired ? '이 교회의 첫 관리자 계정을 만들어 주세요.' : '교회 찬양팀 계정으로 로그인하세요.'}</p>
      </div>
      {setupRequired && <label><span>표시 이름</span><input autoFocus value={form.displayName} onChange={event => update('displayName', event.target.value)} placeholder="예: 김찬양"/></label>}
      <label><span>아이디</span><input autoFocus={!setupRequired} autoCapitalize="none" autoComplete="username" value={form.username} onChange={event => update('username', event.target.value)} placeholder="영문 소문자와 숫자, 3자 이상"/></label>
      <label><span>비밀번호</span><input type="password" autoComplete={setupRequired ? 'new-password' : 'current-password'} value={form.password} onChange={event => update('password', event.target.value)} placeholder="8자 이상"/></label>
      {setupRequired && <label><span>비밀번호 확인</span><input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={event => update('confirmPassword', event.target.value)} placeholder="비밀번호를 한 번 더 입력"/></label>}
      {error && <div className="auth-error">{error}</div>}
      <button className="primary-button auth-submit" disabled={submitting || !form.username || !form.password || (setupRequired && !form.displayName)}>
        {submitting ? <><div className="button-spinner"/> 처리 중…</> : setupRequired ? <><ShieldCheck/> 관리자 계정 만들기</> : '로그인'}
      </button>
      {setupRequired && <small className="auth-notice">첫 계정은 사용자와 시스템 설정을 관리하는 관리자 권한으로 생성됩니다.</small>}
    </form>
  </div>;
}

function AdminModal({
  currentUser, onMaintenanceComplete, onClose, onLogout,
}) {
  const emptyForm = { username: '', displayName: '', password: '', role: 'leader' };
  const [users, setUsers] = useState([]);
  const [createForm, setCreateForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [maintenance, setMaintenance] = useState(null);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/users', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '사용자를 불러오지 못했어요.');
      setUsers(data.users || []);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };
  const loadMaintenance = async () => {
    setMaintenanceLoading(true);
    try {
      const response = await fetch('/api/admin/maintenance', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '정리 상태를 불러오지 못했어요.');
      setMaintenance(data);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setMaintenanceLoading(false);
    }
  };
  useEffect(() => { loadUsers(); loadMaintenance(); }, []);
  const updateLocal = (id, patch) => setUsers(current => current.map(user => user.id === id ? { ...user, ...patch } : user));
  const create = async event => {
    event.preventDefault();
    setSaving('create'); setError('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '사용자를 만들지 못했어요.');
      setCreateForm(emptyForm);
      await loadUsers();
    } catch (createError) {
      setError(createError.message);
    } finally {
      setSaving('');
    }
  };
  const save = async user => {
    setSaving(user.id); setError('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '사용자를 수정하지 못했어요.');
      if (user.id === currentUser.id && user.password) {
        await onLogout();
        return;
      }
      updateLocal(user.id, { ...data, password: '' });
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving('');
    }
  };
  const remove = async user => {
    if (!window.confirm(`${user.displayName} 계정을 삭제할까요?`)) return;
    setSaving(user.id); setError('');
    try {
      const response = await fetch(`/api/admin/users?id=${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '사용자를 삭제하지 못했어요.');
      setUsers(current => current.filter(item => item.id !== user.id));
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setSaving('');
    }
  };
  const runMaintenance = async () => {
    if (!window.confirm('콘티에서 사용하지 않는 찬양과 악보 파일을 완전히 정리할까요?')) return;
    setMaintenanceLoading(true); setError(''); setMaintenanceMessage('');
    try {
      const response = await fetch('/api/admin/maintenance', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '정리를 실행하지 못했어요.');
      setMaintenance(data.status);
      const result = data.result || {};
      setMaintenanceMessage(`찬양 ${result.songsDeleted || 0}개, 악보 ${result.imagesDeleted || 0}개를 정리했어요.`);
      await onMaintenanceComplete?.();
    } catch (maintenanceError) {
      setError(maintenanceError.message);
    } finally {
      setMaintenanceLoading(false);
    }
  };
  return <ModalShell onClose={onClose} wide>
    <div className="modal-header">
      <div><h2>사용자 및 권한 관리</h2><p>찬양팀 계정을 만들고 역할별 사용 범위를 관리하세요.</p></div>
      <button className="modal-close" onClick={onClose}><X/></button>
    </div>
    <div className="admin-body">
      <section className="admin-create">
        <div><h3>새 사용자</h3><p>초기 비밀번호는 사용자에게 안전하게 전달해 주세요.</p></div>
        <form onSubmit={create}>
          <input value={createForm.displayName} onChange={event => setCreateForm(current => ({ ...current, displayName: event.target.value }))} placeholder="표시 이름"/>
          <input value={createForm.username} onChange={event => setCreateForm(current => ({ ...current, username: event.target.value }))} placeholder="아이디"/>
          <input type="password" value={createForm.password} onChange={event => setCreateForm(current => ({ ...current, password: event.target.value }))} placeholder="초기 비밀번호"/>
          <select value={createForm.role} onChange={event => setCreateForm(current => ({ ...current, role: event.target.value }))}>
            {['leader', 'accompanist', 'member', 'admin'].map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
          </select>
          <button className="primary-button" disabled={saving === 'create' || !createForm.displayName || !createForm.username || !createForm.password}><UserPlus/> 추가</button>
        </form>
      </section>
      <div className="role-guide">
        <span><b>관리자</b> 전체 기능과 사용자 관리</span>
        <span><b>인도자</b> 행사·콘티 전체 관리</span>
        <span><b>반주자</b> 조회 및 악보 메모 수정</span>
        <span><b>성도</b> 조회 전용</span>
      </div>
      <section className="maintenance-card">
        <div className="maintenance-heading">
          <div><h3>저장소 자동 정리</h3><p>콘티에서 사용하지 않는 찬양과 악보를 하루 한 번 자동으로 정리합니다.</p></div>
          <button className="secondary-button" disabled={maintenanceLoading} onClick={runMaintenance}>{maintenanceLoading ? '검사 중…' : '지금 검사'}</button>
        </div>
        <div className="maintenance-stats">
          <span><b>{maintenance?.pending?.songs || 0}</b>정리할 찬양</span>
          <span><b>{maintenance?.pending?.images || 0}</b>정리할 악보</span>
          <span><b>{formatBytes(maintenance?.pending?.bytes)}</b>예상 확보</span>
          <span><b>{maintenance?.lastRunAt || '실행 기록 없음'}</b>마지막 검사</span>
        </div>
        {maintenanceMessage && <div className="maintenance-message"><Check/> {maintenanceMessage}</div>}
      </section>
      {error && <div className="form-error admin-error">{error}</div>}
      <section className="user-list">
        <div className="user-list-heading"><h3>등록된 사용자</h3><span>{users.length}명</span></div>
        {loading ? <div className="admin-loading"><div className="spinner"/></div> : users.map(user => <div className={`user-row ${!user.active ? 'inactive' : ''}`} key={user.id}>
          <div className="user-identity"><div><UserRound/></div><span><b>{user.username}</b><small>{user.lastLoginAt ? `최근 로그인 ${user.lastLoginAt}` : '로그인 기록 없음'}</small></span></div>
          <input value={user.displayName} onChange={event => updateLocal(user.id, { displayName: event.target.value })}/>
          <select value={user.role} disabled={user.id === currentUser.id} onChange={event => updateLocal(user.id, { role: event.target.value })}>
            {['admin', 'leader', 'accompanist', 'member'].map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
          </select>
          <label className="active-toggle"><input type="checkbox" checked={user.active} disabled={user.id === currentUser.id} onChange={event => updateLocal(user.id, { active: event.target.checked })}/><span>활성</span></label>
          <input className="reset-password" type="password" value={user.password || ''} onChange={event => updateLocal(user.id, { password: event.target.value })} placeholder="새 비밀번호 (선택)"/>
          <div className="user-actions"><button className="secondary-button" disabled={saving === user.id} onClick={() => save(user)}>저장</button><button className="delete-button" disabled={saving === user.id || user.id === currentUser.id} onClick={() => remove(user)}><Trash2/></button></div>
        </div>)}
      </section>
    </div>
  </ModalShell>;
}

function SettingsModal({
  currentUser, settings, onApply, onUserChange, onLogout, onClose,
}) {
  const [profile, setProfile] = useState({
    displayName: currentUser.displayName,
    password: '',
    confirmPassword: '',
  });
  const [preferences, setPreferences] = useState(settings.preferences);
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const requestSave = async (scope, body) => {
    setSaving(scope); setError(''); setMessage('');
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, ...body }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '환경 설정을 저장하지 못했어요.');
      return data;
    } finally {
      setSaving('');
    }
  };
  const saveProfile = async event => {
    event.preventDefault();
    if (profile.password && profile.password !== profile.confirmPassword) {
      setError('새 비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    try {
      const data = await requestSave('profile', profile);
      if (data.passwordChanged) {
        await onLogout();
        return;
      }
      onUserChange(data.user);
      setProfile(current => ({ ...current, password: '', confirmPassword: '' }));
      setMessage('내 정보가 저장됐어요.');
    } catch (saveError) {
      setError(saveError.message);
    }
  };
  const savePreferences = async event => {
    event.preventDefault();
    try {
      const data = await requestSave('preferences', preferences);
      setPreferences(data.preferences);
      onApply({ preferences: data.preferences });
      setMessage('뷰어 개인 설정이 저장됐어요.');
    } catch (saveError) {
      setError(saveError.message);
    }
  };
  return <ModalShell onClose={onClose} wide>
    <div className="modal-header">
      <div><h2>환경 설정</h2><p>내 계정과 뷰어의 개인 설정을 관리하세요.</p></div>
      <button className="modal-close" onClick={onClose}><X/></button>
    </div>
    <div className="settings-body">
      <form className="settings-section" onSubmit={saveProfile}>
        <div className="settings-heading"><div><h3>내 계정</h3><p>아이디는 변경할 수 없습니다.</p></div><span>{roleLabel(currentUser.role)}</span></div>
        <div className="settings-grid">
          <label><span>아이디</span><input value={currentUser.username} disabled/></label>
          <label><span>표시 이름</span><input value={profile.displayName} onChange={event => setProfile(current => ({ ...current, displayName: event.target.value }))}/></label>
          <label><span>새 비밀번호 <em>선택</em></span><input type="password" autoComplete="new-password" placeholder="8자 이상" value={profile.password} onChange={event => setProfile(current => ({ ...current, password: event.target.value }))}/></label>
          <label><span>새 비밀번호 확인</span><input type="password" autoComplete="new-password" value={profile.confirmPassword} onChange={event => setProfile(current => ({ ...current, confirmPassword: event.target.value }))}/></label>
        </div>
        <div className="settings-actions"><button className="secondary-button" disabled={saving === 'profile' || !profile.displayName.trim()}>내 정보 저장</button></div>
      </form>

      {['admin', 'leader'].includes(currentUser.role) && <form className="settings-section" onSubmit={savePreferences}>
        <div className="settings-heading"><div><h3>뷰어 빠른 진행 알림</h3><p>악보 하단에서 바로 누를 진행 알림 버튼을 설정합니다.</p></div><span>개인 설정</span></div>
        <div className="quick-signal-preferences">
          <label className="settings-check"><span>퀵버튼 표시</span><span><input type="checkbox" checked={preferences.quickSignalsEnabled !== false} onChange={event => setPreferences(current => ({ ...current, quickSignalsEnabled: event.target.checked }))}/>{preferences.quickSignalsEnabled !== false ? '사용' : '사용 안 함'}</span></label>
          <fieldset disabled={preferences.quickSignalsEnabled === false}>
            <legend>표시 위치</legend>
            <div className="position-options">
              <label className={preferences.quickSignalsPosition !== 'right' ? 'selected' : ''}><input type="radio" name="quick-signal-position" value="left" checked={preferences.quickSignalsPosition !== 'right'} onChange={() => setPreferences(current => ({ ...current, quickSignalsPosition: 'left' }))}/><span>왼쪽 하단</span></label>
              <label className={preferences.quickSignalsPosition === 'right' ? 'selected' : ''}><input type="radio" name="quick-signal-position" value="right" checked={preferences.quickSignalsPosition === 'right'} onChange={() => setPreferences(current => ({ ...current, quickSignalsPosition: 'right' }))}/><span>오른쪽 하단</span></label>
            </div>
          </fieldset>
        </div>
        <div className="settings-actions"><button className="secondary-button" disabled={saving === 'preferences'}>뷰어 설정 저장</button></div>
      </form>}
      {error && <div className="form-error settings-feedback">{error}</div>}
      {message && <div className="settings-message"><Check/> {message}</div>}
    </div>
    <div className="modal-footer"><button className="primary-button" onClick={onClose}>닫기</button></div>
  </ModalShell>;
}

function Logo({ compact = false, churchName = '' }) {
  const church = churchName.trim();
  return <div className={`logo ${compact ? 'compact' : ''}`}>
    <div className="logo-mark"><Music2 size={21}/></div>
    <div className="logo-copy">
      <b title={church || '찬양이음'}>{church || '찬양이음'}</b>
      <span>{church ? '찬양이음' : '찬양팀 콘티 관리'}</span>
    </div>
  </div>;
}

function Sidebar({
  events, selectedEvent, contiCount, onCalendar, onEvent, onCreateEvent,
  onEditEvent, onArchive, onSongs, canEdit, isAdmin, onAdmin, onSettings,
  churchName, open, onClose, collapsed, onToggleCollapse,
}) {
  const [pastEventsOpen, setPastEventsOpen] = useState(false);
  const upcomingEvents = events
    .filter(event => event.end >= TODAY)
    .sort((a, b) => a.start.localeCompare(b.start));
  const pastEvents = events
    .filter(event => event.end < TODAY)
    .sort((a, b) => b.start.localeCompare(a.start));
  const pastEventsByYear = pastEvents.reduce((groups, event) => {
    const year = event.start.slice(0, 4);
    if (!groups[year]) groups[year] = [];
    groups[year].push(event);
    return groups;
  }, {});
  useEffect(() => {
    if (pastEvents.some(event => event.id === selectedEvent)) setPastEventsOpen(true);
  }, [selectedEvent, events]);
  const eventRow = event => <div key={event.id} className={`event-row ${canEdit ? 'editable' : ''} ${selectedEvent === event.id ? 'selected' : ''}`}>
    <button className="event-select" onClick={() => onEvent(event.id)}><i style={{background: event.color}}/><span>{event.title}</span></button>
    {canEdit && <button className="event-edit" title="행사 수정" onClick={() => onEditEvent(event)}><MoreHorizontal size={15}/></button>}
  </div>;
  return <>
    {open && <div className="sidebar-scrim" onClick={onClose}/>}
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-top">
        <Logo churchName={churchName}/>
        <button className="sidebar-close" onClick={onClose}><X/></button>
        <button
          className="sidebar-collapse"
          onClick={onToggleCollapse}
          title="메뉴 접기"
          aria-label="메뉴 접기"
        ><PanelLeftClose size={18}/></button>
      </div>
      <nav className="side-nav">
        <div className="nav-label">콘티 관리</div>
        <button className="active" onClick={onCalendar}><CalendarDays/><span>콘티 달력</span><em>{contiCount}</em></button>
        <div className="nav-label event-label">행사 바로가기</div>
        <div className="event-list">
          {upcomingEvents.map(eventRow)}
          {!upcomingEvents.length && <span className="event-list-empty">예정된 행사가 없어요</span>}
          {canEdit && <button className="new-event" onClick={onCreateEvent}><Plus size={15}/><span>새 행사 만들기</span></button>}
        </div>
        {pastEvents.length > 0 && <>
          <button className={`past-events-toggle ${pastEventsOpen ? 'open' : ''}`} onClick={() => setPastEventsOpen(value => !value)}>
            <Archive/><span>지난 행사</span><em>{pastEvents.length}</em><ChevronDown className="push" size={16}/>
          </button>
          {pastEventsOpen && <div className="past-event-groups">
            {Object.entries(pastEventsByYear).sort(([a], [b]) => b.localeCompare(a)).map(([year, yearEvents]) => <section key={year}>
              <div className="past-event-year">{year}년</div>
              <div className="event-list past-event-list">{yearEvents.map(eventRow)}</div>
            </section>)}
          </div>}
        </>}
        <div className="nav-label separated">라이브러리</div>
        <button onClick={onArchive}><Archive/><span>지난 콘티</span></button>
        <button onClick={onSongs}><ListMusic/><span>자주 부른 찬양</span></button>
      </nav>
      <div className="sidebar-bottom">
        {isAdmin && <button onClick={onAdmin}><ShieldCheck size={18}/><span>관리자 메뉴</span></button>}
        <button onClick={onSettings}><Settings size={18}/><span>환경 설정</span></button>
      </div>
    </aside>
  </>;
}

function Calendar({ month, setMonth, selected, setSelected, contis, events, servicePresets = SERVICE_TYPES }) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const year = month.getFullYear(), m = month.getMonth();
  const first = new Date(year, m, 1);
  const start = new Date(year, m, 1 - first.getDay());
  const last = new Date(year, m + 1, 0);
  const weekCount = Math.ceil((first.getDay() + last.getDate()) / 7);
  const days = Array.from({ length: weekCount * 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const title = `${year}년 ${m + 1}월`;
  const today = TODAY;
  const selectedIndex = days.findIndex(date => iso(date) === selected);
  const selectedWeek = selectedIndex >= 0 ? Math.floor(selectedIndex / 7) : 0;
  const move = n => {
    setMonth(new Date(year, m + n, 1));
    setMobileExpanded(true);
  };

  return (
    <div className="calendar">
      <div className="calendar-toolbar">
        <div className="month-control">
          <button className="icon-button" onClick={() => move(-1)}><ChevronLeft size={19}/></button>
          <h2>{title}</h2>
          <button className="icon-button" onClick={() => move(1)}><ChevronRight size={19}/></button>
        </div>
        <button className="today-button" onClick={() => {
          const current = new Date(`${today}T00:00:00`);
          setMonth(new Date(current.getFullYear(), current.getMonth(), 1));
          setSelected(today);
          setMobileExpanded(false);
        }}>오늘</button>
      </div>
      <div className="weekdays">{['일','월','화','수','목','금','토'].map((d,i) => <span key={d} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>{d}</span>)}</div>
      <div className={`days-grid ${mobileExpanded ? 'mobile-expanded' : 'mobile-collapsed'}`}>
        {days.map((date, dayIndex) => {
          const value = iso(date), inMonth = date.getMonth() === m;
          const dayContis = contis
            .filter(c => c.date === value)
            .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
          const dayEvents = events.filter(e => value >= e.start && value <= e.end);
          const visibleContis = dayContis.length > 4 ? dayContis.slice(0, 3) : dayContis.slice(0, 4);
          return <button
            key={value} className={`day ${Math.floor(dayIndex / 7) === selectedWeek ? 'selected-week' : ''} ${!inMonth ? 'outside' : ''} ${selected === value ? 'selected' : ''} ${value === today ? 'today' : ''}`}
            onClick={() => { setSelected(value); setMobileExpanded(false); }}
          >
            <div className="day-topline">
              <span className="day-number">{date.getDate()}</span>
              {dayEvents.length > 0 && <span className="day-event-marker" title={dayEvents.map(event => event.title).join(', ')} style={{'--event-color': dayEvents[0].color}}><i/>{dayEvents[0].title}{dayEvents.length > 1 ? ` +${dayEvents.length - 1}` : ''}</span>}
            </div>
            <div className="day-items">
              {visibleContis.map(c => {
                const service = servicePresets.find(s => s.id === c.serviceType);
                return <span key={c.id} className="calendar-item" style={{'--item-color': service?.color || '#06b6d4'}}><i/>{c.time ? `${c.time} ` : ''}{service?.label || c.title}</span>;
              })}
              {dayContis.length > 4 && <span className="calendar-more">+{dayContis.length - 3}개 더</span>}
            </div>
          </button>;
        })}
      </div>
      <button className={`calendar-expand ${mobileExpanded ? 'expanded' : ''}`} onClick={() => setMobileExpanded(value => !value)}>{mobileExpanded ? '달력 접기' : '월 전체 보기'}<ChevronDown size={15}/></button>
      <div className="calendar-legend">
        {servicePresets.filter(service => service.active).map(s => <span key={s.id}><i style={{background:s.color}}/>{s.label}</span>)}
      </div>
    </div>
  );
}

function ContiCard({ conti, onView, onEdit }) {
  return <article className="conti-card" onClick={onView}>
    <div className="conti-cover" style={{backgroundImage: `url(${conti.pages[0]?.image || ''})`}}>
      <div className="page-count"><FileImage size={13}/>{conti.pages.length}장</div>
      <button className="cover-open"><Maximize2 size={16}/></button>
    </div>
    <div className="conti-info">
      <div className="conti-meta">
        <h3>{conti.title}</h3>
        <span className={`conti-time ${!conti.time ? 'unset' : ''}`}>{conti.time || '시간 미정'}</span>
      </div>
      <div className="song-preview">{conti.pages.slice(0,3).map((p,i) => <span key={p.id}>{i+1}. {p.title}</span>)}{conti.pages.length > 3 && <span className="more-songs">… 외 {conti.pages.length - 3}곡</span>}</div>
      <div className="card-footer"><span>인도 {conti.leader || '미정'}</span>{onEdit && <button onClick={e => {e.stopPropagation(); onEdit();}}><MoreHorizontal/></button>}</div>
    </div>
  </article>;
}

function RecentSection({ contis, onView, onAll, servicePresets = SERVICE_TYPES }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const today = iso(now);
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const upcoming = contis.filter(item => !item.archived && (
    item.date > today
    || (item.date === today && (!item.time || item.time > currentTime))
  ));
  return <section className="recent-section">
    <div className="section-heading"><div><h2>다가오는 콘티</h2><p>미리 준비할 예배와 행사를 확인하세요.</p></div><button onClick={onAll}>전체 보기 <ChevronRight size={16}/></button></div>
    <div className="recent-grid">
      {upcoming.sort((a,b) => (
        a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99')
      )).slice(0,3).map(c => {
        const service = servicePresets.find(s => s.id === c.serviceType);
        return <button key={c.id} className="recent-card" onClick={() => onView(c)}>
          <div className="recent-date"><b>{new Date(`${c.date}T00:00:00`).getDate()}</b><span>{new Date(`${c.date}T00:00:00`).getMonth()+1}월</span></div>
          <div><span style={{color: service?.color || '#0e7490'}}>{c.time ? `${c.time} · ` : ''}{service?.label || '행사 콘티'}</span><h3>{c.title}</h3><p>{c.pages.length}곡 · 인도 {c.leader || '미정'}</p></div>
          <ChevronRight className="recent-arrow"/>
        </button>;
      })}
    </div>
  </section>;
}

function ModalShell({ children, onClose, wide = false, viewer = false, modalRef = null }) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const close = e => {
      if (e.key !== 'Escape') return;
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
      onCloseRef.current();
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, []);
  useEffect(() => {
    const body = document.body;
    const root = document.documentElement;
    openModalCount += 1;
    body.classList.add('modal-open');
    root.classList.add('modal-open');
    return () => {
      openModalCount = Math.max(0, openModalCount - 1);
      if (!openModalCount) {
        body.classList.remove('modal-open');
        root.classList.remove('modal-open');
      }
    };
  }, []);
  return <div className={`modal-backdrop ${viewer ? 'viewer-backdrop' : ''}`} onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div ref={modalRef} className={`modal ${wide ? 'wide' : ''} ${viewer ? 'viewer-modal' : ''}`}>{children}</div>
  </div>;
}

function ContiEditor({
  initial, mode, eventId, selectedDate, events = [], songs, defaultServiceType,
  currentUser, isAdmin, leaderOptions = [], servicePresets = SERVICE_TYPES,
  instrumentPresets = DEFAULT_INSTRUMENTS, onClose, onSave, onDelete,
}) {
  const activeServicePresets = servicePresets.filter(preset => preset.active || preset.id === initial?.serviceType);
  const [form, setForm] = useState(() => {
    if (initial) return {
      ...initial,
      time: initial.time || '',
      ...(!isAdmin ? { leader: currentUser.displayName, ownerUserId: currentUser.id } : {}),
    };
    const serviceType = mode === 'regular' ? (defaultServiceType || 'sunday-morning') : 'event';
    return {
      id: `c-${Date.now()}`, mode, eventId: mode === 'event' ? eventId : undefined,
      date: selectedDate, time: mode === 'event' ? '09:00' : serviceDefaultTime(serviceType, servicePresets),
      serviceType,
      title: '',
      leader: currentUser.displayName,
      ownerUserId: currentUser.id,
      memo: '', pages: [], updatedAt: '방금 전',
    };
  });
  const [searchPageIndex, setSearchPageIndex] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);
  const [leaderPickerOpen, setLeaderPickerOpen] = useState(false);
  const [importingPdf, setImportingPdf] = useState(false);
  const fileRef = useRef(null);
  const pdfRef = useRef(null);
  const [uploadTarget, setUploadTarget] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const update = (key, value) => setForm(v => ({ ...v, [key]: value }));
  const changeContiMode = nextMode => setForm(current => {
    const nextServiceType = nextMode === 'event'
      ? 'event'
      : (current.serviceType === 'event' ? (defaultServiceType || 'sunday-morning') : current.serviceType);
    return {
      ...current,
      mode: nextMode,
      eventId: nextMode === 'event' ? (current.eventId || eventId || events[0]?.id || '') : undefined,
      time: nextMode === 'event'
        ? (current.mode === 'event' ? (current.time || '09:00') : '09:00')
        : (current.mode === 'regular' ? (current.time || serviceDefaultTime(nextServiceType, servicePresets)) : serviceDefaultTime(nextServiceType, servicePresets)),
      serviceType: nextServiceType,
    };
  });
  const changeServiceType = serviceType => setForm(current => ({
    ...current,
    serviceType,
    time: serviceDefaultTime(serviceType, servicePresets),
  }));
  const addEmptyPage = () => setForm(current => ({
    ...current,
    pages: [...current.pages, { id: `p-${Date.now()}`, title: '', key: '', memo: '', startInstrument: '', transitionMode: '', image: '' }],
  }));
  const updatePage = (index, patch) => setForm(current => ({
    ...current,
    pages: current.pages.map((page, pageIndex) => pageIndex === index ? { ...page, ...patch } : page),
  }));
  const deletePage = index => setForm(current => ({
    ...current,
    pages: current.pages.filter((_, pageIndex) => pageIndex !== index),
  }));
  const handleFiles = async files => {
    const validFiles = [...files].filter(file => file.type.startsWith('image/'));
    const pages = await Promise.all(validFiles.map((file, offset) => new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        id: `p-${Date.now()}-${offset}`,
        title: file.name.replace(/\.[^.]+$/, ''),
        key: '',
        memo: '',
        startInstrument: '',
        transitionMode: '',
        image: reader.result,
        sourceType: 'upload',
      });
      reader.readAsDataURL(file);
    })));
    setForm(current => {
      if (uploadTarget === 'new') return { ...current, pages: [...current.pages, ...pages] };
      if (typeof uploadTarget === 'number' && pages[0]) {
        return {
          ...current,
          pages: current.pages.map((page, index) => index === uploadTarget
            ? { ...page, image: pages[0].image, imageId: null, sourceUrl: null, sourceType: 'upload' }
            : page),
        };
      }
      return current;
    });
    if (fileRef.current) fileRef.current.value = '';
  };
  const handlePdf = async file => {
    if (!file) return;
    setFormError('');
    if (file.type && file.type !== 'application/pdf' && !file.name.toLocaleLowerCase().endsWith('.pdf')) {
      setFormError('PDF 파일을 선택해 주세요.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setFormError('PDF는 25MB 이하여야 합니다.');
      return;
    }
    setImportingPdf(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/contis/pdf-import', { method: 'POST', body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'PDF 악보를 가져오지 못했어요.');
      setForm(current => ({ ...current, pages: [...current.pages, ...(data.pages || [])] }));
    } catch (error) {
      setFormError(error.message || 'PDF 악보를 가져오지 못했어요.');
    } finally {
      setImportingPdf(false);
      if (pdfRef.current) pdfRef.current.value = '';
    }
  };
  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setForm(current => {
      const oldIndex = current.pages.findIndex(page => page.id === active.id);
      const newIndex = current.pages.findIndex(page => page.id === over.id);
      return { ...current, pages: arrayMove(current.pages, oldIndex, newIndex) };
    });
  };
  const submit = async () => {
    setSaving(true);
    setFormError('');
    try {
      await onSave(form);
    } catch (error) {
      setFormError(error.message || '콘티를 저장하지 못했어요.');
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!window.confirm('이 콘티를 삭제할까요? 저장된 악보 원본은 라이브러리에 남습니다.')) return;
    setSaving(true);
    setFormError('');
    try {
      await onDelete();
    } catch (error) {
      setFormError(error.message || '콘티를 삭제하지 못했어요.');
      setSaving(false);
    }
  };
  const valid = form.title.trim()
    && form.leader.trim()
    && (!isAdmin || form.ownerUserId)
    && form.date
    && (form.mode !== 'event' || form.eventId)
    && form.pages.length
    && form.pages.every(p => p.image);
  const selectedLeaderAccount = leaderOptions.find(option => option.id === form.ownerUserId);

  return <ModalShell onClose={onClose} wide>
    <div className="modal-header">
      <div><h2>{initial ? '콘티 수정하기' : '새 콘티 만들기'}</h2><p>예배 정보와 악보 이미지를 순서대로 등록하세요.</p></div>
      <button className="modal-close" onClick={onClose}><X/></button>
    </div>
    <div className="editor-body">
      <section className="form-section">
        <div className="section-number">01</div>
        <div className="form-content">
          <div className="form-title"><h3>예배 정보</h3><p>콘티를 구분할 기본 정보를 입력해 주세요.</p></div>
          <div className="form-grid">
            <label><span>콘티 구분</span><select value={form.mode} onChange={e => changeContiMode(e.target.value)}><option value="regular">일반 예배</option><option value="event" disabled={!events.length}>행사</option></select></label>
            <label><span>날짜</span><input type="date" value={form.date} onChange={e => update('date', e.target.value)}/></label>
            {form.mode === 'event' && <label><span>행사</span><select value={form.eventId || ''} onChange={e => update('eventId', e.target.value)}><option value="" disabled>행사를 선택하세요</option>{events.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>}
            {form.mode === 'event' && <label><span>예배 시간</span><input type="time" value={form.time || ''} onChange={e => update('time', e.target.value)}/></label>}
            {form.mode === 'regular' && <label><span>예배 종류</span><select value={form.serviceType} onChange={e => changeServiceType(e.target.value)}>{activeServicePresets.map(s => <option key={s.id} value={s.id}>{s.label}{s.active ? '' : ' (사용 중지)'}</option>)}</select></label>}
            {form.mode === 'regular' && <label><span>예배 시간</span><input type="time" value={form.time || ''} onChange={e => update('time', e.target.value)}/></label>}
            <label className="full"><span>콘티 제목</span><input placeholder="예: 7월 넷째 주 주일낮예배" value={form.title} onChange={e => update('title', e.target.value)}/></label>
            {isAdmin ? <div className={`leader-account-field ${leaderPickerOpen ? 'open' : ''}`}>
              <span>인도자 계정</span>
              <button type="button" className="leader-picker-trigger" aria-expanded={leaderPickerOpen} onClick={() => setLeaderPickerOpen(open => !open)}>
                  <span className="leader-account-name">
                  <b>{selectedLeaderAccount?.displayName || form.leader || '인도자 선택'}</b>
                  <small>{selectedLeaderAccount ? selectedLeaderAccount.username : '계정을 선택하세요'}</small>
                </span>
                <ChevronDown/>
              </button>
              {leaderPickerOpen && <div className="leader-picker-menu">
                {leaderOptions.map(option => <button type="button" key={option.id} className={option.id === form.ownerUserId ? 'selected' : ''} onClick={() => {
                  setForm(current => ({ ...current, ownerUserId: option.id, leader: option.displayName }));
                  setLeaderPickerOpen(false);
                }}>
                  <span className="leader-account-name"><b>{option.displayName}</b><small>{option.username}</small></span>
                  {option.id === form.ownerUserId && <Check/>}
                </button>)}
              </div>}
            </div>
              : <div className="leader-account-field"><span>인도자</span><div className="leader-picker-trigger readonly"><span className="leader-account-name"><b>{currentUser.displayName}</b><small>{currentUser.username}</small></span></div></div>}
            <label><span>메모 <em>선택</em></span><input placeholder="팀원에게 전달할 메모" value={form.memo} onChange={e => update('memo', e.target.value)}/></label>
          </div>
        </div>
      </section>
      <section className="form-section">
        <div className="section-number">02</div>
        <div className="form-content">
          <div className="form-title inline"><div><h3>악보 이미지</h3><p>곡 순서대로 이미지를 추가하세요. 끌어서 순서를 바꿀 수 있어요.</p></div><span className="count-badge">{form.pages.length}곡</span></div>
          {form.pages.length > 0 && <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={form.pages.map(page => page.id)} strategy={verticalListSortingStrategy}>
              <div className="page-editor-list">
                {form.pages.map((page, index) => <SortablePageEditor
                  key={page.id}
                  page={page}
                  index={index}
                  instrumentPresets={instrumentPresets}
                  onUpdate={patch => updatePage(index, patch)}
                  onDelete={() => deletePage(index)}
                  onSearch={() => setSearchPageIndex(index)}
                  onUpload={() => { setUploadTarget(index); fileRef.current?.click(); }}
                />)}
              </div>
            </SortableContext>
          </DndContext>}
          <div className="add-options">
            <button className="add-option upload" onClick={() => {setUploadTarget('new');fileRef.current?.click();}}><div><Upload/></div><span><b>내 기기에서 업로드</b><small>JPG, PNG, WEBP 이미지를 선택하세요</small></span><ChevronRight/></button>
            <button className="add-option pdf" disabled={importingPdf} onClick={() => pdfRef.current?.click()}><div>{importingPdf ? <div className="pdf-spinner"/> : <FileText/>}</div><span><b>{importingPdf ? 'PDF 변환 중…' : 'PDF 악보 가져오기'}</b><small>페이지별 악보와 제목을 자동으로 추출해요</small></span><ChevronRight/></button>
            <button className="add-option search" onClick={() => {addEmptyPage(); setSearchPageIndex(form.pages.length);}}><div><Search/></div><span><b>인터넷에서 이미지 찾기</b><small>곡 제목으로 악보 이미지를 검색해요</small></span><ChevronRight/></button>
            <button className="add-option library" onClick={() => setShowLibrary(true)}><div><ListMusic/></div><span><b>저장된 악보 다시 사용</b><small>자주 부른 찬양에서 바로 선택하세요</small></span><ChevronRight/></button>
            <button className="small-add" onClick={addEmptyPage}><Plus/> 빈 곡 추가</button>
          </div>
          <input ref={fileRef} hidden type="file" accept="image/*" multiple={uploadTarget === 'new'} onChange={e => handleFiles(e.target.files)}/>
          <input ref={pdfRef} hidden type="file" accept="application/pdf,.pdf" onChange={e => handlePdf(e.target.files?.[0])}/>
        </div>
      </section>
    </div>
    {formError && <div className="form-error">{formError}</div>}
    <div className="modal-footer">
      {onDelete && <button className="danger-button push-left" disabled={saving} onClick={remove}><Trash2 size={16}/> 삭제</button>}
      <button className="secondary-button" disabled={saving} onClick={onClose}>취소</button>
      <button className="primary-button" disabled={!valid || saving || importingPdf} onClick={submit}>{saving ? <><div className="button-spinner"/> 저장 중…</> : <><Check size={17}/> 콘티 저장</>}</button>
    </div>
    {searchPageIndex !== null && <ImageSearch
      initialQuery={form.pages[searchPageIndex]?.title}
      onClose={() => setSearchPageIndex(null)}
      onSelect={item => {
        updatePage(searchPageIndex, {
          image: item.image,
          imageId: item.imageId || null,
          sourceUrl: item.sourceUrl || null,
          sourceType: item.sourceType || 'search',
          width: item.width || null,
          height: item.height || null,
          title: form.pages[searchPageIndex]?.title || item.title,
          // 서버에 저장된 악보라면 Key 도 함께 딸려온다. 이미 적어둔 값은 건드리지 않는다.
          key: form.pages[searchPageIndex]?.key || item.key || '',
        });
        setSearchPageIndex(null);
      }}
    />}
    {showLibrary && <SongLibraryPicker
      songs={songs}
      onClose={() => setShowLibrary(false)}
      onSelect={(song, image) => {
        setForm(current => ({
          ...current,
          pages: [...current.pages, {
            id: `p-${Date.now()}`,
            title: song.title,
            // 저장된 악보에 붙어 있는 Key 를 그대로 가져온다.
            key: image.key || '',
            memo: '',
            startInstrument: '',
            transitionMode: '',
            image: image.image,
            imageId: image.imageId,
            sourceUrl: image.sourceUrl || null,
            sourceType: image.sourceType || 'stored',
            width: image.width || null,
            height: image.height || null,
          }],
        }));
        setShowLibrary(false);
      }}
    />}
  </ModalShell>;
}

function SortablePageEditor({ page, index, instrumentPresets, onUpdate, onDelete, onSearch, onUpload }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  return <div
    ref={setNodeRef}
    className={`page-editor ${isDragging ? 'dragging' : ''}`}
    style={{ transform: CSS.Transform.toString(transform), transition }}
  >
    <button type="button" className="drag-handle" aria-label={`${index + 1}번 곡 순서 이동`} {...attributes} {...listeners}><GripVertical/></button>
    <div className="page-index">{String(index + 1).padStart(2, '0')}</div>
    <button type="button" className="page-thumb" onClick={onUpload} style={{ backgroundImage: page.image ? `url(${page.image})` : '' }}>
      {!page.image && <><ImagePlus/><span>이미지</span></>}
    </button>
    <div className="page-fields">
      <input placeholder="찬양 제목" value={page.title} onChange={event => onUpdate({ title: event.target.value })}/>
      <div>
        <input className="key-input" placeholder="Key" value={page.key} onChange={event => onUpdate({ key: event.target.value })}/>
        <button type="button" className="inline-action" onClick={onSearch}><Search size={15}/> 웹에서 찾기</button>
        <button type="button" className="inline-action" onClick={onUpload}><Upload size={15}/> 업로드</button>
      </div>
      <div className="page-cue-fields">
        <select aria-label="시작 악기" value={page.startInstrument || ''} onChange={event => onUpdate({ startInstrument: event.target.value })}><option value="">시작 악기 미정</option>{selectableInstruments(instrumentPresets, page.startInstrument).map(instrument => <option key={instrument.id} value={instrument.id}>{instrument.label} 시작</option>)}</select>
        <select aria-label="다음 곡 전환" value={page.transitionMode || ''} onChange={event => onUpdate({ transitionMode: event.target.value })}><option value="">전환 미정</option><option value="continue">이어서 넘어가기</option><option value="stop">끊고 넘어가기</option></select>
      </div>
      <input className="page-memo-input" placeholder="이 악보에서 전달할 메모 (선택)" value={page.memo || ''} onChange={event => onUpdate({ memo: event.target.value })}/>
    </div>
    <button type="button" className="delete-button" onClick={onDelete}><Trash2 size={17}/></button>
  </div>;
}

/* 악보는 해상도가 곧 실용성이라, 고르기 전에 화질을 알려준다.
   네이버 축소본은 원본을 복구할 수 있어 검색상 폭보다 크게 잡힌다(expectedWidth). */
const sheetQuality = item => {
  const width = item.expectedWidth || item.width || 0;
  if (!width) return { level: 'unknown', label: '크기 미상' };
  if (width >= 1600) return { level: 'high', label: '고화질' };
  if (width >= 900) return { level: 'mid', label: `${item.width}px` };
  return { level: 'low', label: `${item.width}px 낮음` };
};

function ImageSearch({ initialQuery = '', onClose, onSelect }) {
  const [query, setQuery] = useState(initialQuery || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [excludedCount, setExcludedCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [preview, setPreview] = useState(null);
  const openPreview = async item => {
    // 네이버 이미지는 검색 결과가 축소본이라 원본을 찾아야 하고,
    // 카카오·다음 계열은 원본이지만 직접 로드가 막혀 프록시를 거쳐야 한다.
    const shouldFindOriginal = !item.stored
      && /(?:pstatic\.net|kakaocdn\.net|daumcdn\.net|uf\.daum\.net|cafe\.daum\.net)/i.test(item.image || '');
    setPreview({...item, resolvingOriginal: shouldFindOriginal, upgraded: false});
    if (!shouldFindOriginal) return;

    try {
      const response = await fetch('/api/image-original', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          sourceUrl: item.sourceUrl,
          imageUrl: item.image,
          width: item.width,
          height: item.height,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '원본 이미지를 확인하지 못했어요.');
      setPreview(current => current?.id === item.id ? {
        ...current,
        image: data.image || current.image,
        width: data.width || current.width,
        height: data.height || current.height,
        fallbackImage: data.fallbackImage || current.image,
        fallbackWidth: current.width,
        fallbackHeight: current.height,
        resolvingOriginal: false,
        loadingOriginalImage: Boolean(data.image && data.image !== current.image),
        upgraded: Boolean(data.upgraded),
        originalFound: Boolean(data.originalFound),
      } : current);
    } catch {
      setPreview(current => current?.id === item.id
        ? {...current, resolvingOriginal: false, upgraded: false}
        : current);
    }
  };
  const handlePreviewImageError = event => {
    if (preview?.upgraded && preview.fallbackImage) {
      setPreview(current => current ? {
        ...current,
        image: current.fallbackImage,
        width: current.fallbackWidth,
        height: current.fallbackHeight,
        upgraded: false,
        originalFound: false,
        loadingOriginalImage: false,
      } : current);
      return;
    }
    if (event.currentTarget.src !== preview?.thumbnail) event.currentTarget.src = preview?.thumbnail;
  };
  const handlePreviewImageLoad = () => {
    if (!preview?.loadingOriginalImage) return;
    setPreview(current => current ? {...current, loadingOriginalImage: false} : current);
  };
  const search = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(''); setPreview(null);
    try {
      const response = await fetch(`/api/image-search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '이미지 검색에 실패했어요.');
      setResults(data.items || []);
      setSearchedQuery(data.query || `${query.trim()} 악보`);
      setExcludedCount(data.excludedCount || 0);
      setSavedCount(data.savedCount || 0);
      if (!data.items?.length) setError('검색 결과가 없어요. 다른 검색어를 입력해 보세요.');
    } catch (searchError) {
      setError(searchError.message || '이미지 검색에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally { setLoading(false); }
  };
  useEffect(() => { if (initialQuery) search(); }, []);
  return <div className="nested-modal">
    <div className="search-dialog">
      {preview ? <>
        <div className="search-dialog-header">
          <div><h3>악보 미리보기</h3><p>{preview.title}</p></div>
          <button onClick={() => setPreview(null)}><ArrowLeft/></button>
        </div>
        <div className="preview-canvas">
          {(preview.resolvingOriginal || preview.loadingOriginalImage) && <div className="preview-quality-status checking"><div className="spinner"/> 고해상도 원본 확인 중…</div>}
          {!preview.resolvingOriginal && !preview.loadingOriginalImage && preview.upgraded && <div className="preview-quality-status"><Check/> 고해상도 원본</div>}
          {!preview.resolvingOriginal && !preview.loadingOriginalImage && !preview.upgraded && preview.originalFound && <div className="preview-quality-status"><Check/> 블로그 원본</div>}
          <img
            src={preview.image}
            alt={preview.title}
            onLoad={handlePreviewImageLoad}
            onError={handlePreviewImageError}
          />
        </div>
        <div className="preview-details">
          <div><b>{preview.title}</b><span>{preview.source || '다음 이미지 검색'}{preview.width && preview.height ? ` · ${preview.width} × ${preview.height}px` : ''}{preview.resolvingOriginal || preview.loadingOriginalImage ? ' · 원본 확인 중' : preview.upgraded ? ' · 고해상도 원본' : preview.originalFound ? ' · 블로그 원본' : ''}</span></div>
          <a href={preview.image} target="_blank" rel="noreferrer">원본 열기 <ExternalLink size={13}/></a>
        </div>
        <div className="search-dialog-footer">
          <button type="button" className="secondary-button" onClick={() => setPreview(null)}>목록으로</button>
          <button type="button" className="primary-button" disabled={preview.resolvingOriginal || preview.loadingOriginalImage} onClick={() => onSelect(preview)}>{preview.resolvingOriginal || preview.loadingOriginalImage ? '원본 확인 중…' : <><Check size={17}/> 이 이미지 넣기</>}</button>
        </div>
      </> : <>
        <div className="search-dialog-header"><div><h3>다음에서 악보 찾기</h3><p>곡 제목 뒤에 ‘악보’를 더해 검색하고 원하는 이미지를 선택하세요.</p></div><button onClick={onClose}><X/></button></div>
        <form className="search-bar" onSubmit={e => {e.preventDefault();search();}}><Search/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="곡 제목을 입력하세요"/><button>검색</button></form>
        <div className="search-meta"><span>{searchedQuery ? `“${searchedQuery}” 검색 결과${savedCount ? ` · 서버 저장본 ${savedCount}개 우선` : ''}` : '검색어 뒤에 “악보”를 붙여 검색해요'}</span><span>{excludedCount ? `판매·동영상 사이트 ${excludedCount}건 제외 · ` : ''}원본 출처와 사용 권한을 확인하세요</span></div>
        <div className={`image-results ${loading ? 'loading' : ''}`}>
          {loading && <div className="search-state"><div className="spinner"/><p>이미지를 찾고 있어요…</p></div>}
          {!loading && error && <div className="search-state"><Search/><p>{error}</p></div>}
          {!loading && !error && !results.length && <div className="search-state"><FileImage/><p>곡 제목으로 이미지를 검색해 보세요.</p></div>}
          {!loading && results.map(item => {
            const quality = sheetQuality(item);
            return <button key={item.id} type="button" className={`image-result ${item.stored ? 'stored-result' : ''}`} onClick={() => openPreview(item)}>
              <div className="result-image">
                <img src={item.thumbnail || item.image} alt=""/>
                {item.stored && <b className="stored-badge"><Check size={12}/> 서버 저장본</b>}
                <em className={`quality-badge ${quality.level}`}>{quality.label}</em>
                <span><Maximize2 size={13}/> 크게 보기</span>
              </div>
              <div className="result-caption">
                <span>{item.title}{item.source && ` · ${item.source}`}</span>
                <strong><Maximize2 size={13}/> 미리보기</strong>
              </div>
            </button>;
          })}
        </div>
      </>}
    </div>
  </div>;
}

function EventEditor({ initial, onClose, onSave, onDelete }) {
  const defaultEnd = new Date();
  defaultEnd.setDate(defaultEnd.getDate() + 2);
  const [form, setForm] = useState(initial || { title: '', start: TODAY, end: iso(defaultEnd), color: '#06b6d4' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const update = (key,value) => setForm(v => ({...v,[key]:value}));
  const submit = async () => {
    setSaving(true); setError('');
    try {
      await onSave({ ...form, id: form.id || `e-${Date.now()}` });
    } catch (saveError) {
      setError(saveError.message || '행사를 저장하지 못했어요.');
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!window.confirm('행사를 삭제할까요? 행사 안에 등록된 콘티도 함께 삭제됩니다.')) return;
    setSaving(true); setError('');
    try {
      await onDelete();
    } catch (deleteError) {
      setError(deleteError.message || '행사를 삭제하지 못했어요.');
      setSaving(false);
    }
  };
  return <ModalShell onClose={onClose}>
    <div className="modal-header"><div><h2>{initial ? '행사 수정하기' : '새 행사 만들기'}</h2><p>수련회, 성경학교 등 특별 행사를 폴더로 관리하세요.</p></div><button className="modal-close" onClick={onClose}><X/></button></div>
    <div className="simple-form">
      <label><span>행사 이름</span><input autoFocus placeholder="예: 2026 여름 청년수련회" value={form.title} onChange={e => update('title',e.target.value)}/></label>
      <div className="form-grid"><label><span>시작일</span><input type="date" value={form.start} onChange={e => update('start',e.target.value)}/></label><label><span>종료일</span><input type="date" value={form.end} onChange={e => update('end',e.target.value)}/></label></div>
      <label><span>폴더 색상</span><div className="color-picker">{['#06b6d4','#f97316','#10b981','#2563eb','#8b5cf6'].map(c => <button key={c} style={{background:c}} className={form.color === c ? 'selected' : ''} onClick={() => update('color',c)}>{form.color===c && <Check/>}</button>)}</div></label>
      <div className="event-preview"><Folder style={{color:form.color}}/><div><span>행사 폴더 미리보기</span><b>{form.title || '행사 이름'}</b><small>{dateKo(form.start)} — {dateKo(form.end)}</small></div></div>
    </div>
    {error && <div className="form-error">{error}</div>}
    <div className="modal-footer">
      {onDelete && <button className="danger-button push-left" disabled={saving} onClick={remove}><Trash2 size={16}/> 삭제</button>}
      <button className="secondary-button" disabled={saving} onClick={onClose}>취소</button>
      <button className="primary-button" disabled={!form.title || form.end < form.start || saving} onClick={submit}>{saving ? <><div className="button-spinner"/> 저장 중…</> : <><FolderPlus size={17}/> {initial ? '수정 저장' : '행사 만들기'}</>}</button>
    </div>
  </ModalShell>;
}

function LibraryModal({ songs, onClose }) {
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const openSong = async song => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/songs?id=${encodeURIComponent(song.id)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '저장된 악보를 불러오지 못했어요.');
      setSelected(data.song);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };
  return <ModalShell onClose={onClose} wide>
    <div className="modal-header">
      <div><h2>{selected ? selected.title : '자주 부른 찬양'}</h2><p>{selected ? `저장된 악보 ${selected.images.length}개 · 콘티 ${selected.contiCount}회` : '저장된 콘티를 바탕으로 곡과 악보 원본을 모아 보여드려요.'}</p></div>
      <button className="modal-close" onClick={onClose}><X/></button>
    </div>
    <div className="library-body">
      {selected && <button className="library-back" onClick={() => setSelected(null)}><ArrowLeft/> 찬양 목록</button>}
      {loading && <div className="admin-loading"><div className="spinner"/></div>}
      {!loading && error && <div className="form-error settings-feedback">{error}</div>}
      {!loading && selected && <div className="stored-sheet-grid">{selected.images.map((image, index) => <a className="stored-sheet-card" href={image.image} target="_blank" rel="noreferrer" key={image.imageId}>
        <div><img src={image.image} alt={`${selected.title} 악보 ${index + 1}`}/></div>
        <span><b>악보 {index + 1}</b><small>{image.width && image.height ? `${image.width} × ${image.height}px · ` : ''}${image.useCount}회 사용</small></span>
        <ExternalLink/>
      </a>)}</div>}
      {!loading && !selected && songs.length ? <div className="song-library-grid">{songs.map((song, index) => <button className="song-library-card" key={song.id} onClick={() => openSong(song)}>
        <div className="song-library-image">{song.image ? <img src={song.image} alt=""/> : <Music2/>}</div>
        <div><span>#{String(index + 1).padStart(2, '0')}</span><h3>{song.title}</h3><p>콘티 {song.contiCount}회 · 저장된 악보 {song.imageCount}개</p>{song.lastUsedDate && <small>최근 사용 {dateKo(song.lastUsedDate)}</small>}</div>
        <ChevronRight/>
      </button>)}</div> : !loading && !selected && <div className="library-empty"><ListMusic/><h3>아직 저장된 찬양이 없어요</h3><p>콘티를 저장하면 곡과 악보가 이곳에 자동으로 모입니다.</p></div>}
    </div>
    <div className="modal-footer"><button className="primary-button" onClick={onClose}>확인</button></div>
  </ModalShell>;
}

function SongLibraryPicker({ songs, onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const filtered = songs.filter(song => song.title.toLocaleLowerCase('ko-KR').includes(query.trim().toLocaleLowerCase('ko-KR')));
  const openSong = async song => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/songs?id=${encodeURIComponent(song.id)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '저장된 악보를 불러오지 못했어요.');
      setSelected(data.song);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };
  return <div className="nested-modal">
    <div className="search-dialog library-picker">
      <div className="search-dialog-header">
        <div><h3>{selected ? selected.title : '저장된 악보 다시 사용'}</h3><p>{selected ? '추가할 악보를 선택하세요.' : '이전에 저장한 찬양과 악보를 바로 불러옵니다.'}</p></div>
        <button onClick={selected ? () => setSelected(null) : onClose}>{selected ? <ArrowLeft/> : <X/>}</button>
      </div>
      {!selected && <div className="search-bar"><Search/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="찬양 제목 검색"/></div>}
      <div className="library-picker-body">
        {loading && <div className="search-state"><div className="spinner"/><p>악보를 불러오고 있어요…</p></div>}
        {!loading && error && <div className="search-state"><FileImage/><p>{error}</p></div>}
        {!loading && selected && <div className="stored-sheet-grid picker">{selected.images.map((image, index) => <button className="stored-sheet-card" onClick={() => onSelect(selected, image)} key={image.imageId}>
          <div><img src={image.image} alt={`${selected.title} 악보 ${index + 1}`}/></div>
          <span><b>악보 {index + 1}</b><small>{image.width && image.height ? `${image.width} × ${image.height}px` : `${image.useCount}회 사용`}</small></span>
          <Plus/>
        </button>)}</div>}
        {!loading && selected && !selected.images.length && <div className="search-state"><FileImage/><p>저장된 악보가 없어요.</p></div>}
        {!loading && !selected && <div className="library-picker-list">{filtered.map(song => <button key={song.id} onClick={() => openSong(song)}>
          <div className="song-library-image">{song.image ? <img src={song.image} alt=""/> : <Music2/>}</div>
          <span><b>{song.title}</b><small>콘티 {song.contiCount}회 · 악보 {song.imageCount}개</small></span>
          <ChevronRight/>
        </button>)}</div>}
        {!loading && !selected && !filtered.length && <div className="search-state"><ListMusic/><p>해당하는 찬양이 없어요.</p></div>}
      </div>
    </div>
  </div>;
}

function ArchiveModal({ contis, initialScope = 'past', onClose, onView }) {
  const [scope, setScope] = useState(initialScope);
  const [query, setQuery] = useState('');
  const [modeFilter, setModeFilter] = useState('all');
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
  const filtered = contis
    .filter(conti => {
      if (scope === 'past' && !(conti.archived || conti.date < TODAY)) return false;
      if (scope === 'upcoming' && (conti.archived || conti.date < TODAY)) return false;
      if (modeFilter !== 'all' && conti.mode !== modeFilter) return false;
      if (normalizedQuery && ![conti.title, conti.leader, ...conti.pages.map(page => page.title)]
        .some(value => String(value || '').toLocaleLowerCase('ko-KR').includes(normalizedQuery))) return false;
      return true;
    })
    .sort((a, b) => scope === 'upcoming'
      ? a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99')
      : b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
  const title = scope === 'past' ? '지난 콘티' : scope === 'upcoming' ? '다가오는 콘티' : '전체 콘티';
  return <ModalShell onClose={onClose} wide>
    <div className="modal-header">
      <div><h2>{title}</h2><p>제목, 인도자 또는 찬양 제목으로 필요한 콘티를 찾아보세요.</p></div>
      <button className="modal-close" onClick={onClose}><X/></button>
    </div>
    <div className="library-body">
      <div className="archive-tools">
        <div className="archive-tabs">
          {[['past','지난 콘티'],['upcoming','다가오는 콘티'],['all','전체']].map(([value,label]) => <button className={scope === value ? 'active' : ''} key={value} onClick={() => setScope(value)}>{label}</button>)}
        </div>
        <div className="archive-search"><Search/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="콘티·인도자·찬양 검색"/><select value={modeFilter} onChange={event => setModeFilter(event.target.value)}><option value="all">전체 종류</option><option value="regular">일반 콘티</option><option value="event">행사 콘티</option></select></div>
      </div>
      {filtered.length ? <div className="archive-list">{filtered.map(conti => <button key={conti.id} onClick={() => onView(conti)}>
        <div className="archive-cover">{conti.pages[0]?.image ? <img src={conti.pages[0].image} alt=""/> : <FileImage/>}</div>
        <div><span>{dateKo(conti.date, true)}{conti.time ? ` · ${conti.time}` : ''}</span><h3>{conti.title}</h3><p>{conti.pages.length}곡 · 인도 {conti.leader || '미정'}</p></div>
        <ChevronRight/>
      </button>)}</div> : <div className="library-empty"><Archive/><h3>조건에 맞는 콘티가 없어요</h3><p>기간이나 검색어를 바꿔 보세요.</p></div>}
    </div>
    <div className="modal-footer"><button className="primary-button" onClick={onClose}>확인</button></div>
  </ModalShell>;
}

function ShareModal({ conti, onClose }) {
  const [links, setLinks] = useState([]);
  const [preset, setPreset] = useState('7');
  const [customExpiry, setCustomExpiry] = useState('');
  const [latestUrl, setLatestUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const loadLinks = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/shares?contiId=${encodeURIComponent(conti.id)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '공유 링크를 불러오지 못했어요.');
      setLinks(data.links || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadLinks(); }, [conti.id]);

  const createLink = async () => {
    let expiresAt;
    if (preset === 'custom') {
      const parsed = new Date(customExpiry);
      if (!customExpiry || !Number.isFinite(parsed.getTime())) {
        setError('만료 날짜와 시간을 입력해 주세요.');
        return;
      }
      expiresAt = parsed.toISOString();
    } else {
      expiresAt = new Date(Date.now() + Number(preset) * 86400_000).toISOString();
    }
    setSaving(true); setError(''); setCopied(false);
    try {
      const response = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contiId: conti.id, expiresAt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '공유 링크를 만들지 못했어요.');
      setLatestUrl(data.url);
      await loadLinks();
    } catch (createError) {
      setError(createError.message);
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(latestUrl);
      setCopied(true);
    } catch {
      const input = document.querySelector('.share-created-url');
      input?.select();
      document.execCommand('copy');
      setCopied(true);
    }
  };

  const revoke = async id => {
    setError('');
    try {
      const response = await fetch(`/api/shares?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '공유 링크를 폐기하지 못했어요.');
      await loadLinks();
    } catch (revokeError) {
      setError(revokeError.message);
    }
  };

  const formatShareDate = value => value
    ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '기록 없음';

  return <ModalShell onClose={onClose}>
    <div className="modal-header">
      <div><h2>콘티 공유</h2><p>만료 시간이 있는 조회 링크를 만들어 전달하세요.</p></div>
      <button className="modal-close" onClick={onClose}><X/></button>
    </div>
    <div className="share-modal-body">
      <section className="share-create">
        <h3>{conti.title}</h3>
        <p>{dateKo(conti.date, true)} · 인도 {conti.leader || '미정'} · {conti.pages.length}곡</p>
        <label>링크 만료</label>
        <div className="share-expiry-options">
          {[['1','1일'],['7','7일'],['30','30일'],['custom','직접 지정']].map(([value, label]) =>
            <button key={value} className={preset === value ? 'active' : ''} onClick={() => setPreset(value)}>{label}</button>)}
        </div>
        {preset === 'custom' && <input
          type="datetime-local"
          value={customExpiry}
          min={new Date(Date.now() + 60000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
          onChange={event => setCustomExpiry(event.target.value)}
        />}
        <button className="primary-button share-create-button" disabled={saving} onClick={createLink}>
          <Link2/>{saving ? '만드는 중…' : '새 공유 링크 만들기'}
        </button>
        {latestUrl && <div className="share-created">
          <span>새 링크는 지금 복사해 주세요. 보안을 위해 주소는 다시 표시되지 않습니다.</span>
          <div><input className="share-created-url" readOnly value={latestUrl}/><button onClick={copyLink}><Copy/>{copied ? '복사됨' : '복사'}</button></div>
        </div>}
        {error && <p className="form-error">{error}</p>}
      </section>
      <section className="share-history">
        <div><h3>발급 기록</h3><span>{links.length}개</span></div>
        {loading ? <div className="share-loading"><div className="spinner"/>불러오는 중…</div>
          : links.length ? links.map(link => <article key={link.id} className={!link.active ? 'inactive' : ''}>
            <div><b>{link.active ? '사용 중' : link.revokedAt ? '폐기됨' : '만료됨'}</b><span>{link.creatorName} 발급</span></div>
            <p>만료 {formatShareDate(link.expiresAt)} · 열람 {link.accessCount}회</p>
            {link.canRevoke && link.active && <button onClick={() => revoke(link.id)}>링크 폐기</button>}
          </article>) : <p className="share-empty">아직 발급한 공유 링크가 없습니다.</p>}
      </section>
    </div>
    <div className="modal-footer"><button className="primary-button" onClick={onClose}>완료</button></div>
  </ModalShell>;
}

function DocumentViewer({
  conti, canEditMemo, canEditCues, canSendSignals, flowSignals = DEFAULT_FLOW_SIGNALS,
  instrumentPresets = DEFAULT_INSTRUMENTS,
  quickSignalsEnabled = true, quickSignalsPosition = 'left', canShare,
  onSaveMemo, onRemoteMemo, onSaveCue, onClose,
}) {
  const [page, setPage] = useState(0);
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
        if (message.type === 'presence.snapshot') {
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') scrollToPage(Math.min(conti.pages.length - 1, page + 1));
      if (e.key === 'ArrowLeft') scrollToPage(Math.max(0, page - 1));
    };
    document.addEventListener('keydown',keys);
    return () => document.removeEventListener('keydown',keys);
  }, [conti.pages.length, page]);
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
        ...patch,
      });
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
  <ModalShell onClose={onClose} viewer modalRef={fullscreenRef}>
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
        <button title={isFullscreen ? '전체화면 종료' : '전체화면'} onClick={toggleFullscreen}>{isFullscreen ? <Minimize2/> : <Maximize2/>}</button>
        <button onClick={onClose} className="viewer-desktop-only" aria-label="닫기"><X/></button>
      </div>
    </header>
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
      {canSendSignals && quickSignalsEnabled && flowSignals.length > 0 && <div className="viewer-flow-quick" data-position={quickSignalsPosition === 'right' ? 'right' : 'left'} aria-label="빠른 진행 알림">
        {flowSignals.map(({ id, label, icon, color }) => <button
          key={id}
          type="button"
          style={{ '--signal-color': color }}
          disabled={Boolean(signalSending)}
          onClick={() => sendFlowSignal(id)}
          aria-label={label}
          title={label}
        ><FlowSignalIcon name={icon}/>{signalSending === id && <i/>}</button>)}
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
                </> : <>
                  {item.startInstrument && <span>{instrumentLabel(item.startInstrument, instrumentPresets, item.startInstrumentLabel)} 시작</span>}
                  {item.transitionMode && <span>{item.transitionMode === 'stop' ? '끊고' : '이어서'}</span>}
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
  </ModalShell>
  {shareOpen && <ShareModal conti={conti} onClose={() => setShareOpen(false)}/>}
  </>;
}
