"use client";

import React, { useEffect, useRef, useState } from 'react';
import {
  Archive, CalendarDays, Check, CirclePlus, Folder, LogOut, Menu, Music2,
  PanelLeftClose, PanelLeftOpen, Plus, Settings, ShieldCheck, X,
} from 'lucide-react';
import { DEFAULT_SETTINGS, TODAY, dateKo } from './appUtils.js';
import { Logo, Sidebar } from './AppChrome.jsx';
import { Calendar, ContiCard, RecentSection } from './Dashboard.jsx';
import ContiEditor from './ContiEditor.jsx';
import DocumentViewer from './DocumentViewer.jsx';
import { ArchiveModal, EventEditor, LibraryModal, ModalShell } from './AppModals.jsx';

/* 브라우저 임시 저장본을 계정별로 나눠 둔다.
 *
 * 키를 계정과 무관하게 쓰면, 공용 태블릿에서 A 가 로그아웃한 뒤 B 가 로그인했을 때
 * 서버 연결이 실패하는 순간 B 화면에 A 의 콘티가 그대로 뜬다.
 * key 가 null 이면(=로그인 전) 읽지도 쓰지도 않는다. */
function usePersistentState(key, initial) {
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!key) {
      setReady(false);
      return;
    }
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(key));
    } catch { /* 손상된 저장본은 초기값으로 시작한다 */ }
    // 계정이 바뀌면 이전 계정의 값이 남지 않도록 항상 덮어쓴다.
    setValue(stored || initial);
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready || !key) return;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* uploaded images may exceed browser quota */ }
  }, [key, ready, value]);
  return [value, setValue, ready];
}

/* 예전 버전이 계정 구분 없이 저장해 둔 값. 로그인 시 한 번 정리한다. */
const LEGACY_STORAGE_KEYS = ['muse-contis', 'muse-events'];

export default function App() {
  const [auth, setAuth] = useState({ loading: true, setupRequired: false, user: null });
  const [selectedEvent, setSelectedEvent] = useState('');
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const todayDate = new Date(`${TODAY}T00:00:00`);
  const [calendarMonth, setCalendarMonth] = useState(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
  const storageScope = auth.user?.id || '';
  const [contis, setContis, contisReady] = usePersistentState(storageScope && `muse-contis:${storageScope}`, []);
  const [events, setEvents, eventsReady] = usePersistentState(storageScope && `muse-events:${storageScope}`, []);
  const [songs, setSongs] = useState([]);
  const [leaderOptions, setLeaderOptions] = useState([]);
  const [servicePresets, setServicePresets] = useState([]);
  const [instrumentPresets, setInstrumentPresets] = useState([]);
  const [flowSignals, setFlowSignals] = useState([]);
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

  // 계정 구분 없이 저장돼 있던 예전 값을 지운다. 남겨두면 다른 계정 사용자가 볼 수 있다.
  useEffect(() => {
    try {
      LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
    } catch { /* 저장소를 못 써도 진행에는 지장이 없다 */ }
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
        setServicePresets(Array.isArray(data.servicePresets) ? data.servicePresets : []);
        setInstrumentPresets(Array.isArray(data.instrumentPresets) ? data.instrumentPresets : []);
        setFlowSignals(Array.isArray(data.flowSignals) ? data.flowSignals : []);
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
        setServicePresets(Array.isArray(data.servicePresets) ? data.servicePresets : []);
        setInstrumentPresets(Array.isArray(data.instrumentPresets) ? data.instrumentPresets : []);
        setFlowSignals(Array.isArray(data.flowSignals) ? data.flowSignals : []);
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
    // 이 계정의 임시 저장본을 즉시 지운다.
    // state 를 비우는 것만으로는 부족하다. auth.user 가 null 이 되면 저장 키도 사라져
    // 빈 값을 덮어쓸 기회 없이 이전 내용이 그대로 남는다.
    try {
      if (storageScope) {
        localStorage.removeItem(`muse-contis:${storageScope}`);
        localStorage.removeItem(`muse-events:${storageScope}`);
      }
    } catch { /* 저장소를 못 써도 로그아웃은 계속한다 */ }
    setContis([]);
    setEvents([]);
    setSongs([]);
    setLeaderOptions([]);
    setServicePresets([]);
    setInstrumentPresets([]);
    setFlowSignals([]);
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
