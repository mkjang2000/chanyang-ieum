"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronRight, Database, HardDrive,
  KeyRound, LayoutDashboard, Link2, ListChecks, LogOut, MoreHorizontal, Music2, Plus, RadioTower, RefreshCw,
  Save, Search, Settings2, ShieldCheck, Trash2, UserPlus, Users, X, XCircle,
} from 'lucide-react';
import FlowSignalIcon from './FlowSignalIcon.jsx';
import { FLOW_SIGNAL_ICON_OPTIONS } from './flowSignalConfig.js';

const TABS = [
  { id: 'overview', label: '개요', icon: LayoutDashboard },
  { id: 'users', label: '사용자', icon: Users },
  { id: 'logins', label: '로그인 기록', icon: ListChecks },
  { id: 'shares', label: '공유 링크', icon: Link2 },
  { id: 'presets', label: '교회 설정', icon: Settings2 },
  { id: 'signals', label: '진행 알림', icon: RadioTower },
  { id: 'system', label: '시스템', icon: Activity },
];
const MOBILE_PRIMARY_TAB_IDS = new Set(['overview', 'users', 'shares', 'presets']);
const ROLES = ['admin', 'leader', 'accompanist', 'member'];
const roleLabel = role => ({ admin: '관리자', leader: '인도자', accompanist: '반주자', member: '성도' }[role] || role);

async function requestJson(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || '요청을 처리하지 못했어요.');
  return data;
}

const formatBytes = value => {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
};

const formatDateTime = value => value ? String(value).replace('T', ' ').slice(0, 16) : '기록 없음';

/** "3분 전"처럼 읽히는 상대 시각. 하루가 넘어가면 날짜를 그대로 보여 준다. */
function relativeTime(value) {
  if (!value) return '';
  const then = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(then.getTime())) return '';
  const minutes = Math.round((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간 전`;
  if (minutes < 60 * 24 * 7) return `${Math.floor(minutes / (60 * 24))}일 전`;
  return String(value).slice(0, 10);
}

function deviceName(userAgent = '') {
  const os = /iPad/i.test(userAgent) ? 'iPad'
    : /iPhone/i.test(userAgent) ? 'iPhone'
      : /Android/i.test(userAgent) ? 'Android'
        : /Windows/i.test(userAgent) ? 'Windows'
          : /Macintosh|Mac OS X/i.test(userAgent) ? 'Mac'
            : /Linux/i.test(userAgent) ? 'Linux' : '알 수 없는 기기';
  const browser = /Edg\//.test(userAgent) ? 'Edge'
    : /CriOS|Chrome\//.test(userAgent) ? 'Chrome'
      : /Firefox\//.test(userAgent) ? 'Firefox'
        : /Safari\//.test(userAgent) ? 'Safari' : '';
  return browser ? `${os} · ${browser}` : os;
}

/* ── 모션 · 스크롤 ─────────────────────────────────────────── */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 상단 고정 헤더에 가리지 않도록 스크롤 목표에서 빼 줄 높이. */
const headerOffset = () => (window.innerWidth >= 900 ? 64 : 56) + 12;

/** 모바일 하단 탭바에 가리는 영역. 데스크톱은 탭바가 없다. */
const footerOffset = () => (window.innerWidth >= 900 ? 16 : 74);

/**
 * 펼쳐진 항목이 화면 밖으로 나갈 때만 부드럽게 끌어온다.
 * 이미 다 보이는 항목은 건드리지 않아야 화면이 불필요하게 튀지 않는다.
 */
function scrollIntoViewIfNeeded(element) {
  if (!element) return;
  const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
  const rect = element.getBoundingClientRect();
  const top = headerOffset();
  const bottom = window.innerHeight - footerOffset();

  if (rect.top >= top && rect.bottom <= bottom) return;

  // 항목이 화면보다 길면 위쪽을 맞추고, 짧으면 잘린 만큼만 민다.
  const target = rect.height > bottom - top || rect.top < top
    ? window.scrollY + rect.top - top
    : window.scrollY + rect.bottom - bottom;
  window.scrollTo({ top: Math.max(0, target), behavior });
}

/* ── 공통 UI 조각 ───────────────────────────────────────────── */

function PanelHeading({ title, description, action }) {
  return <div className="admin-panel-heading">
    <div><h1>{title}</h1><p>{description}</p></div>
    {action}
  </div>;
}

function Section({ title, meta, children, className = '' }) {
  return <section className={`admin-section ${className}`.trim()}>
    {title && <div className="admin-section-title"><h2>{title}</h2>{meta && <span>{meta}</span>}</div>}
    {children}
  </section>;
}

function EmptyState({ text, hint }) {
  return <div className="admin-empty"><div className="admin-empty-mark"><Search/></div><p>{text}</p>{hint && <small>{hint}</small>}</div>;
}

function Loading({ label }) {
  return <div className="admin-loading"><div className="spinner"/>{label && <p>{label}</p>}</div>;
}

function ErrorNote({ message, onDismiss }) {
  if (!message) return null;
  return <div className="admin-page-error" role="alert">
    <AlertTriangle/><span>{message}</span>
    {onDismiss && <button type="button" aria-label="오류 닫기" onClick={onDismiss}><X/></button>}
  </div>;
}

/** window.confirm 대신 쓰는 확인 모달. 파괴적 동작은 전부 이걸 거친다. */
function ConfirmDialog({ request, onClose }) {
  const confirmRef = useRef(null);
  useEffect(() => {
    if (!request) return undefined;
    confirmRef.current?.focus();
    const onKey = event => { if (event.key === 'Escape') onClose(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, onClose]);
  if (!request) return null;
  return <div className="admin-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(false); }}>
    <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-confirm-title">
      <div className={`admin-modal-mark ${request.tone || 'danger'}`}>{request.tone === 'danger' ? <Trash2/> : <AlertTriangle/>}</div>
      <h3 id="admin-confirm-title">{request.title}</h3>
      {request.body && <p>{request.body}</p>}
      <div className="admin-modal-actions">
        <button type="button" className="secondary-button" onClick={() => onClose(false)}>취소</button>
        <button type="button" ref={confirmRef} className={request.tone === 'danger' ? 'danger-button solid' : 'primary-button'} onClick={() => onClose(true)}>
          {request.confirmLabel || '확인'}
        </button>
      </div>
    </div>
  </div>;
}

/** 확인 모달을 promise 로 쓰게 해 주는 훅. `await confirm({...})` 형태. */
function useConfirm() {
  const [request, setRequest] = useState(null);
  const resolver = useRef(null);
  const confirm = useCallback(options => new Promise(resolve => {
    resolver.current = resolve;
    setRequest(options);
  }), []);
  const close = useCallback(result => {
    setRequest(null);
    resolver.current?.(result);
    resolver.current = null;
  }, []);
  return { confirm, dialog: <ConfirmDialog request={request} onClose={close}/> };
}

function StatusPill({ tone = 'idle', children }) {
  return <span className={`status-pill ${tone}`}><i/>{children}</span>;
}

function StatCard({ icon: Icon, label, value, sub, tone }) {
  return <article className="stat-card">
    <div className="stat-card-top"><span className={`stat-icon ${tone || ''}`.trim()}><Icon/></span>{sub && <small>{sub}</small>}</div>
    <b>{value}</b><span>{label}</span>
  </article>;
}

/* ── 페이지 ────────────────────────────────────────────────── */

export default function AdminPage() {
  const [auth, setAuth] = useState({ loading: true, user: null });
  const [churchName, setChurchName] = useState('');
  const [tab, setTab] = useState('overview');
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const requested = new URL(window.location.href).searchParams.get('tab');
    if (TABS.some(item => item.id === requested)) setTab(requested);
    requestJson('/api/auth/status')
      .then(data => {
        if (!data.user || data.user.role !== 'admin') {
          window.location.replace('/');
          return;
        }
        setAuth({ loading: false, user: data.user });
        requestJson('/api/settings').then(settings => setChurchName(settings.system?.churchName || '')).catch(() => {});
      })
      .catch(() => window.location.replace('/'));
  }, []);

  useEffect(() => {
    if (!mobileMoreOpen) return undefined;
    const onKeyDown = event => { if (event.key === 'Escape') setMobileMoreOpen(false); };
    const onResize = () => { if (window.innerWidth >= 900) setMobileMoreOpen(false); };
    document.body.classList.add('admin-mobile-menu-open');
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.classList.remove('admin-mobile-menu-open');
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [mobileMoreOpen]);

  const changeTab = useCallback(next => {
    setTab(next);
    setMobileMoreOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const notify = useCallback(message => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }, []);

  if (auth.loading || !auth.user) return <div className="admin-boot"><div className="spinner"/><p>관리자 화면을 준비하고 있어요.</p></div>;

  const active = TABS.find(item => item.id === tab) || TABS[0];
  const mobilePrimaryTabs = TABS.filter(item => MOBILE_PRIMARY_TAB_IDS.has(item.id));
  const mobileMoreTabs = TABS.filter(item => !MOBILE_PRIMARY_TAB_IDS.has(item.id));
  const mobileMoreActive = mobileMoreTabs.some(item => item.id === tab);

  return <div className="admin-page">
    <header className="admin-page-header">
      <a className="admin-back" href="/" title="콘티로 돌아가기"><ArrowLeft/> <span>콘티</span></a>
      <div className="admin-brand">
        <span className="admin-brand-mark"><Music2/></span>
        <div><b>{churchName || '찬양이음'}</b><small>관리자 콘솔</small></div>
      </div>
      <div className="admin-account" title={auth.user.displayName}>
        <span className="admin-account-avatar">{auth.user.displayName.slice(0, 1)}</span>
        <div><b>{auth.user.displayName}</b><small><ShieldCheck/> 관리자</small></div>
      </div>
    </header>

    <div className="admin-layout">
      <aside className="admin-nav">
        <p className="admin-nav-label">운영</p>
        <nav>{TABS.map(item => {
          const Icon = item.icon;
          return <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} onClick={() => changeTab(item.id)}>
            <Icon/><span>{item.label}</span>
          </button>;
        })}</nav>
      </aside>

      <main className="admin-content">
        {/* 모바일에서는 하단 탭바가 5개까지만 보이므로 현재 위치를 상단에도 적어 준다. */}
        <p className="admin-crumb"><active.icon/> {active.label}</p>
        {/* key 를 탭마다 바꿔 패널이 교체될 때마다 진입 애니메이션이 다시 돈다. */}
        <div className="admin-panel-swap" key={tab}>
          {tab === 'overview' && <OverviewPanel onNavigate={changeTab}/>}
          {tab === 'users' && <UsersPanel currentUser={auth.user} notify={notify}/>}
          {tab === 'logins' && <LoginRecordsPanel/>}
          {tab === 'shares' && <SharesPanel notify={notify}/>}
          {tab === 'presets' && <PresetsPanel notify={notify} onChurchNameChange={setChurchName}/>}
          {tab === 'signals' && <FlowSignalsPanel notify={notify}/>}
          {tab === 'system' && <SystemPanel notify={notify}/>}
        </div>
      </main>
    </div>

    <nav className="admin-mobile-tabs">{mobilePrimaryTabs.map(item => {
      const Icon = item.icon;
      return <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} onClick={() => changeTab(item.id)}>
        <Icon/><span>{item.label}</span>
      </button>;
    })}<button type="button" className={mobileMoreActive || mobileMoreOpen ? 'active' : ''} aria-expanded={mobileMoreOpen} onClick={() => setMobileMoreOpen(value => !value)}>
      <MoreHorizontal/><span>더보기</span>
    </button></nav>

    {mobileMoreOpen && <div className="admin-mobile-more-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setMobileMoreOpen(false); }}>
      <section className="admin-mobile-more" role="dialog" aria-modal="true" aria-label="관리자 메뉴 더보기">
        <div className="admin-mobile-more-heading"><div><b>관리 메뉴</b><span>추가 관리 기능을 선택하세요.</span></div><button type="button" aria-label="더보기 닫기" onClick={() => setMobileMoreOpen(false)}><X/></button></div>
        <nav>{mobileMoreTabs.map(item => {
          const Icon = item.icon;
          return <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} onClick={() => changeTab(item.id)}><Icon/><span>{item.label}</span><ChevronRight/></button>;
        })}</nav>
      </section>
    </div>}

    {toast && <div className="toast"><Check/>{toast}</div>}
  </div>;
}

/* ── 개요 ──────────────────────────────────────────────────── */

function OverviewPanel({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [status, logins, shares] = await Promise.all([
        requestJson('/api/admin/system'),
        requestJson('/api/admin/login-records?limit=40'),
        requestJson('/api/admin/shares'),
      ]);
      setData({ status, records: logins.records || [], links: shares.links || [] });
      setError('');
    } catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const alerts = useMemo(() => {
    if (!data) return [];
    const { status, records } = data;
    const list = [];
    if (!status.storage.ok) list.push({ tone: 'bad', text: '악보 저장소에 접근할 수 없습니다.', tab: 'system' });
    if (!status.integrations.pdfOcr) list.push({ tone: 'warn', text: 'PDF OCR 도구가 설치되지 않아 제목 자동 인식이 꺼져 있습니다.', tab: 'system' });
    if (!status.integrations.imageSearch) list.push({ tone: 'warn', text: '이미지 검색 API 키가 설정되지 않았습니다.', tab: 'system' });
    if (status.keyQueue.failed) list.push({ tone: 'warn', text: `악보 Key 자동 인식이 ${status.keyQueue.failed}건 실패했습니다.`, tab: 'system' });
    const failedLogins = records.filter(record => !record.success).length;
    if (failedLogins >= 5) list.push({ tone: 'warn', text: `최근 기록에 로그인 실패가 ${failedLogins}건 있습니다.`, tab: 'logins' });
    if (status.maintenance.pending.images || status.maintenance.pending.songs) {
      list.push({ tone: 'info', text: `사용하지 않는 데이터 ${formatBytes(status.maintenance.pending.bytes)}를 정리할 수 있습니다.`, tab: 'system' });
    }
    return list;
  }, [data]);

  if (loading) return <><PanelHeading title="개요" description="교회 계정과 시스템 상태를 한눈에 확인합니다."/><Loading label="상태를 확인하고 있어요."/></>;
  if (error) return <><PanelHeading title="개요" description="교회 계정과 시스템 상태를 한눈에 확인합니다."/><ErrorNote message={error}/></>;
  if (!data) return null;

  const { status, records, links } = data;
  const recentLogins = records.slice(0, 6);
  const expiringSoon = links.filter(link => link.active).length;

  return <>
    <PanelHeading
      title="개요"
      description="교회 계정과 시스템 상태를 한눈에 확인합니다."
      action={<button type="button" className="secondary-button" onClick={load}><RefreshCw/> <span>새로고침</span></button>}
    />

    <div className="stat-grid">
      <StatCard icon={Users} label="활성 사용자" value={status.counts.activeUsers} sub={`${status.counts.activeSessions}기기 로그인 중`}/>
      <StatCard icon={Music2} label="등록된 콘티" value={status.counts.contis} sub={`악보 ${status.counts.images}장`}/>
      <StatCard icon={Link2} label="사용 중 공유 링크" value={expiringSoon} sub={`전체 ${links.length}개`}/>
      <StatCard icon={HardDrive} label="악보 저장 용량" value={formatBytes(status.counts.imageBytes)} sub={status.storage.ok ? '정상' : '확인 필요'} tone={status.storage.ok ? '' : 'bad'}/>
    </div>

    <Section title="점검이 필요한 항목" meta={alerts.length ? `${alerts.length}건` : '이상 없음'}>
      {alerts.length ? <ul className="alert-list">{alerts.map((alert, index) => (
        <li key={index} className={alert.tone}>
          <i/><span>{alert.text}</span>
          <button type="button" onClick={() => onNavigate(alert.tab)}>보기</button>
        </li>
      ))}</ul> : <div className="alert-clear"><Check/><p>모든 항목이 정상입니다.</p></div>}
    </Section>

    <Section title="최근 로그인" meta={<button type="button" className="link-button" onClick={() => onNavigate('logins')}>전체 보기</button>}>
      {recentLogins.length ? <ul className="recent-list">{recentLogins.map(record => (
        <li key={record.id}>
          <StatusPill tone={record.success ? 'ok' : 'bad'}>{record.success ? '성공' : '실패'}</StatusPill>
          <div><b>{record.displayName || record.username || '알 수 없음'}</b><small>{deviceName(record.userAgent)} · {record.ipAddress || 'IP 확인 불가'}</small></div>
          <time>{relativeTime(record.createdAt)}</time>
        </li>
      ))}</ul> : <EmptyState text="아직 로그인 기록이 없습니다."/>}
    </Section>
  </>;
}

/* ── 사용자 ────────────────────────────────────────────────── */

function UsersPanel({ currentUser, notify }) {
  const empty = { displayName: '', username: '', password: '', role: 'leader' };
  const [users, setUsers] = useState([]);
  const [baseline, setBaseline] = useState({});
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const { confirm, dialog } = useConfirm();
  const rowRefs = useRef({});
  const formRef = useRef(null);

  /* 펼침 애니메이션이 끝난 뒤의 최종 높이를 기준으로 스크롤해야
     위치가 어긋나지 않는다. */
  useEffect(() => {
    if (!openId) return undefined;
    const element = rowRefs.current[openId];
    if (!element) return undefined;
    const timer = window.setTimeout(() => scrollIntoViewIfNeeded(element), prefersReducedMotion() ? 0 : 210);
    return () => window.clearTimeout(timer);
  }, [openId]);

  useEffect(() => {
    if (showForm) scrollIntoViewIfNeeded(formRef.current);
  }, [showForm]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await requestJson('/api/admin/users');
      const list = data.users || [];
      setUsers(list);
      setBaseline(Object.fromEntries(list.map(user => [user.id, user])));
      setError('');
    } catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const updateLocal = (id, patch) => setUsers(current => current.map(user => user.id === id ? { ...user, ...patch } : user));

  /** 원본과 달라진 항목만 저장 버튼을 켜기 위한 비교. */
  const isDirty = user => {
    const original = baseline[user.id];
    if (!original) return false;
    return Boolean(user.password)
      || user.displayName !== original.displayName
      || user.role !== original.role
      || user.active !== original.active;
  };

  const create = async event => {
    event.preventDefault(); setSaving('create'); setError('');
    try {
      await requestJson('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      setForm(empty); setShowForm(false); await load(); notify('사용자를 추가했어요.');
    } catch (createError) { setError(createError.message); } finally { setSaving(''); }
  };

  const save = async user => {
    setSaving(user.id); setError('');
    try {
      const saved = await requestJson('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(user) });
      const next = { ...user, ...saved, password: '' };
      updateLocal(user.id, next);
      setBaseline(current => ({ ...current, [user.id]: next }));
      notify('사용자 정보를 저장했어요.');
      if (user.id === currentUser.id && user.password) window.location.replace('/');
    } catch (saveError) { setError(saveError.message); } finally { setSaving(''); }
  };

  const revert = user => {
    const original = baseline[user.id];
    if (original) updateLocal(user.id, { ...original, password: '' });
  };

  const forceLogout = async user => {
    const ok = await confirm({
      title: '모든 기기에서 로그아웃할까요?',
      body: `${user.displayName} 사용자의 로그인 세션 ${user.sessionCount}개가 즉시 종료됩니다.`,
      confirmLabel: '로그아웃',
      tone: 'warn',
    });
    if (!ok) return;
    setSaving(`logout-${user.id}`); setError('');
    try {
      const result = await requestJson('/api/admin/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id }) });
      updateLocal(user.id, { sessionCount: 0 });
      notify(result.ended ? `${result.ended}개의 로그인 세션을 종료했어요.` : '로그인된 기기가 없어요.');
      if (result.self) window.location.replace('/');
    } catch (logoutError) { setError(logoutError.message); } finally { setSaving(''); }
  };

  const remove = async user => {
    const ok = await confirm({
      title: `${user.displayName} 계정을 삭제할까요?`,
      body: '삭제한 계정은 되돌릴 수 없습니다. 잠시 접속을 막으려면 삭제 대신 “사용 중지”를 쓰세요.',
      confirmLabel: '영구 삭제',
      tone: 'danger',
    });
    if (!ok) return;
    setSaving(`delete-${user.id}`); setError('');
    try {
      await requestJson(`/api/admin/users?id=${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      setUsers(current => current.filter(item => item.id !== user.id));
      notify('사용자를 삭제했어요.');
    } catch (removeError) { setError(removeError.message); } finally { setSaving(''); }
  };

  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return users;
    return users.filter(user => `${user.displayName} ${user.username} ${roleLabel(user.role)}`.toLocaleLowerCase().includes(needle));
  }, [users, query]);

  return <>
    {dialog}
    <PanelHeading
      title="사용자"
      description="계정과 권한을 관리하고 필요하면 모든 기기에서 로그아웃시킵니다."
      action={<button type="button" className="primary-button" onClick={() => setShowForm(value => !value)}>
        <UserPlus/> <span>{showForm ? '입력 닫기' : '사용자 추가'}</span>
      </button>}
    />

    {showForm && <div ref={formRef}><Section title="새 사용자" meta="초기 비밀번호는 8자 이상" className="admin-create-card admin-pop-in">
      <form onSubmit={create}>
        <label><span>표시 이름</span><input placeholder="김찬양" value={form.displayName} onChange={event => setForm(current => ({ ...current, displayName: event.target.value }))}/></label>
        <label><span>아이디</span><input placeholder="chanyang" autoCapitalize="none" autoComplete="off" value={form.username} onChange={event => setForm(current => ({ ...current, username: event.target.value }))}/></label>
        <label><span>초기 비밀번호</span><input type="password" placeholder="8자 이상" autoComplete="new-password" value={form.password} onChange={event => setForm(current => ({ ...current, password: event.target.value }))}/></label>
        <label><span>권한</span><select value={form.role} onChange={event => setForm(current => ({ ...current, role: event.target.value }))}>{ROLES.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
        <div className="admin-form-actions">
          <button type="button" className="secondary-button" onClick={() => { setForm(empty); setShowForm(false); }}>취소</button>
          <button type="submit" className="primary-button" disabled={saving === 'create' || !form.displayName || !form.username || !form.password}><UserPlus/> 추가</button>
        </div>
      </form>
    </Section></div>}

    <ErrorNote message={error} onDismiss={() => setError('')}/>

    <div className="admin-filterbar">
      <div className="admin-search"><Search/><input placeholder="이름·아이디로 검색" value={query} onChange={event => setQuery(event.target.value)}/></div>
      <span className="admin-filter-count">{shown.length}명</span>
    </div>

    <Section className="admin-list-card">
      {loading ? <Loading/> : shown.length ? <div className="admin-user-list">{shown.map(user => {
        const open = openId === user.id;
        const dirty = isDirty(user);
        const self = user.id === currentUser.id;
        return <article key={user.id} ref={node => { rowRefs.current[user.id] = node; }} className={`${open ? 'open' : ''} ${user.active ? '' : 'inactive'}`.trim()}>
          <button type="button" className="admin-user-summary" aria-expanded={open} onClick={() => setOpenId(open ? '' : user.id)}>
            <span className={`admin-avatar role-${user.role}`}>{user.displayName.slice(0, 1)}</span>
            <span className="admin-user-id">
              <b>{user.displayName}{self && <em>나</em>}</b>
              <small>@{user.username}</small>
            </span>
            <span className={`role-tag role-${user.role}`}>{roleLabel(user.role)}</span>
            <span className="admin-user-meta">
              {!user.active && <StatusPill tone="bad">중지</StatusPill>}
              {user.sessionCount > 0 && <StatusPill tone="ok">{user.sessionCount}기기</StatusPill>}
              <small>{user.lastLoginAt ? relativeTime(user.lastLoginAt) : '로그인 없음'}</small>
            </span>
            {dirty && <i className="dirty-dot" title="저장하지 않은 변경"/>}
            <ChevronDown className="admin-chevron"/>
          </button>

          <div className="admin-collapse" data-open={open ? 'true' : 'false'}>
            <div className="admin-user-edit">
              <div className="admin-user-fields">
                <label><span>표시 이름</span><input value={user.displayName} onChange={event => updateLocal(user.id, { displayName: event.target.value })}/></label>
                <label><span>권한</span><select value={user.role} disabled={self} onChange={event => updateLocal(user.id, { role: event.target.value })}>{ROLES.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
                <label><span>새 비밀번호</span><input type="password" autoComplete="new-password" placeholder="변경할 때만 입력" value={user.password || ''} onChange={event => updateLocal(user.id, { password: event.target.value })}/></label>
                <label className="admin-switch">
                  <span>계정 사용</span>
                  <input type="checkbox" checked={user.active} disabled={self} onChange={event => updateLocal(user.id, { active: event.target.checked })}/>
                  <em>{user.active ? '사용 중' : '중지됨'}</em>
                </label>
              </div>

              <p className="admin-user-note">
                가입 {user.createdAt || '기록 없음'} · 마지막 로그인 {user.lastLoginAt || '기록 없음'}
                {self && ' · 본인 계정은 권한과 사용 여부를 바꿀 수 없습니다.'}
              </p>

              <div className="admin-user-footer">
                <div className="admin-user-danger">
                  <button type="button" className="admin-action-button" tabIndex={open ? 0 : -1} disabled={!user.sessionCount || saving === `logout-${user.id}`} onClick={() => forceLogout(user)}><LogOut/> 강제 로그아웃</button>
                  {!self && <button type="button" className="admin-action-button danger" tabIndex={open ? 0 : -1} disabled={saving === `delete-${user.id}`} onClick={() => remove(user)}><Trash2/> 삭제</button>}
                </div>
                <div className="admin-user-commit">
                  {dirty && <button type="button" className="admin-action-button" tabIndex={open ? 0 : -1} onClick={() => revert(user)}>되돌리기</button>}
                  <button type="button" className="admin-action-button primary" tabIndex={open ? 0 : -1} disabled={!dirty || saving === user.id} onClick={() => save(user)}>
                    <Save/> {saving === user.id ? '저장 중…' : '저장'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </article>;
      })}</div> : <EmptyState text="조건에 맞는 사용자가 없습니다." hint={query ? '검색어를 지워 보세요.' : undefined}/>}
    </Section>
  </>;
}

/* ── 로그인 기록 ───────────────────────────────────────────── */

function LoginRecordsPanel() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setRecords((await requestJson('/api/admin/login-records?limit=300')).records || []); setError(''); }
    catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => records.filter(record => {
    if (filter === 'success' && !record.success) return false;
    if (filter === 'failed' && record.success) return false;
    const needle = query.trim().toLocaleLowerCase();
    return !needle || `${record.displayName} ${record.username} ${record.ipAddress}`.toLocaleLowerCase().includes(needle);
  }), [records, filter, query]);

  const failedCount = useMemo(() => records.filter(record => !record.success).length, [records]);

  return <>
    <PanelHeading
      title="로그인 기록"
      description="최근 180일간의 성공·실패 기록을 확인합니다."
      action={<button type="button" className="secondary-button" onClick={load}><RefreshCw/> <span>새로고침</span></button>}
    />

    <div className="admin-filterbar">
      <div className="admin-search"><Search/><input placeholder="사용자 또는 IP 검색" value={query} onChange={event => setQuery(event.target.value)}/></div>
      <div className="segmented">
        {[['all', `전체 ${records.length}`], ['success', '성공'], ['failed', `실패 ${failedCount}`]].map(([id, label]) => (
          <button key={id} type="button" className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
    </div>

    <ErrorNote message={error} onDismiss={() => setError('')}/>

    <Section className="admin-list-card">
      {loading ? <Loading/> : shown.length ? <div className="record-list">
        <div className="record-head"><span>결과</span><span>사용자</span><span>접속 환경</span><span>IP</span><span>시각</span></div>
        {shown.map(record => <div className="record-row" key={record.id}>
          <span className="record-status"><StatusPill tone={record.success ? 'ok' : 'bad'}>{record.success ? '성공' : '실패'}</StatusPill></span>
          <span className="record-user"><b>{record.displayName || record.username || '알 수 없음'}</b>{record.displayName && <small>@{record.username}</small>}</span>
          <span className="record-device" data-label="접속 환경">{deviceName(record.userAgent)}</span>
          <span className="record-ip" data-label="IP">{record.ipAddress || '확인 불가'}</span>
          <span className="record-time" data-label="시각"><b>{relativeTime(record.createdAt)}</b><small>{formatDateTime(record.createdAt)}</small></span>
        </div>)}
      </div> : <EmptyState text="조건에 맞는 로그인 기록이 없습니다."/>}
    </Section>
  </>;
}

/* ── 공유 링크 ─────────────────────────────────────────────── */

function SharesPanel({ notify }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active');
  const [error, setError] = useState('');
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try { setLinks((await requestJson('/api/admin/shares')).links || []); setError(''); }
    catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const revoke = async link => {
    const ok = await confirm({
      title: '공유 링크를 폐기할까요?',
      body: `“${link.contiTitle}” 링크를 받은 사람은 더 이상 콘티를 열 수 없습니다.`,
      confirmLabel: '폐기',
      tone: 'danger',
    });
    if (!ok) return;
    try { await requestJson(`/api/admin/shares?id=${encodeURIComponent(link.id)}`, { method: 'DELETE' }); await load(); notify('공유 링크를 폐기했어요.'); }
    catch (revokeError) { setError(revokeError.message); }
  };

  const counts = useMemo(() => ({
    active: links.filter(link => link.active).length,
    inactive: links.filter(link => !link.active).length,
  }), [links]);
  const shown = links.filter(link => filter === 'all' || (filter === 'active' ? link.active : !link.active));

  return <>
    {dialog}
    <PanelHeading
      title="공유 링크"
      description="전체 공유 링크의 만료 상태와 사용 횟수를 확인하고 폐기합니다."
      action={<button type="button" className="secondary-button" onClick={load}><RefreshCw/> <span>새로고침</span></button>}
    />

    <div className="admin-filterbar">
      <div className="segmented wide">
        {[['active', `사용 중 ${counts.active}`], ['inactive', `만료·폐기 ${counts.inactive}`], ['all', `전체 ${links.length}`]].map(([id, label]) => (
          <button key={id} type="button" className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
    </div>

    <ErrorNote message={error} onDismiss={() => setError('')}/>

    <Section className="admin-list-card">
      {loading ? <Loading/> : shown.length ? <div className="admin-share-list">{shown.map(link => (
        <article key={link.id} className={link.active ? '' : 'inactive'}>
          <div className="admin-share-main">
            <b>{link.contiTitle}</b>
            <small>{link.worshipDate} · 인도 {link.leader || '미정'} · 발급 {link.creatorName}</small>
          </div>
          <div className="admin-share-stats">
            <span><em>{link.accessCount}</em>회 접속</span>
            <span>{link.lastAccessedAt ? `최근 ${relativeTime(link.lastAccessedAt)}` : '접속 기록 없음'}</span>
          </div>
          <div className="admin-share-state">
            <StatusPill tone={link.active ? 'ok' : 'idle'}>{link.active ? '사용 중' : link.revokedAt ? '폐기됨' : '만료됨'}</StatusPill>
            <small>{link.active ? `${formatDateTime(link.expiresAt)} 만료` : formatDateTime(link.revokedAt || link.expiresAt)}</small>
          </div>
          <div className="admin-share-action">
            {link.active && <button type="button" className="admin-action-button danger" onClick={() => revoke(link)}><XCircle/> 폐기</button>}
          </div>
        </article>
      ))}</div> : <EmptyState text="표시할 공유 링크가 없습니다."/>}
    </Section>
  </>;
}

/* ── 교회 설정 · 예배 프리셋 ───────────────────────────────── */

function InstrumentPresetsSection({ notify }) {
  const empty = { label: '', sortOrder: 60, active: true };
  const [instruments, setInstruments] = useState([]);
  const [baseline, setBaseline] = useState({});
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = (await requestJson('/api/admin/instruments')).instruments || [];
      setInstruments(list);
      setBaseline(Object.fromEntries(list.map(instrument => [instrument.id, instrument])));
      setError('');
    } catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const updateLocal = (id, patch) => setInstruments(current => current.map(instrument => (
    instrument.id === id ? { ...instrument, ...patch } : instrument
  )));
  const isDirty = instrument => {
    const original = baseline[instrument.id];
    return original && ['label', 'sortOrder', 'active']
      .some(key => (instrument[key] ?? '') !== (original[key] ?? ''));
  };
  const create = async event => {
    event.preventDefault(); setSaving('create'); setError('');
    try {
      await requestJson('/api/admin/instruments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      setForm(empty); setShowForm(false); await load(); notify('시작 악기를 추가했어요.');
    } catch (createError) { setError(createError.message); } finally { setSaving(''); }
  };
  const save = async instrument => {
    setSaving(instrument.id); setError('');
    try {
      const saved = await requestJson('/api/admin/instruments', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(instrument),
      });
      updateLocal(instrument.id, saved);
      setBaseline(current => ({ ...current, [instrument.id]: { ...instrument, ...saved } }));
      notify('시작 악기를 저장했어요.');
    } catch (saveError) { setError(saveError.message); } finally { setSaving(''); }
  };
  const remove = async instrument => {
    const ok = await confirm({
      title: `“${instrument.label}” 악기를 삭제할까요?`,
      body: '삭제한 악기는 되돌릴 수 없습니다.',
      confirmLabel: '삭제',
      tone: 'danger',
    });
    if (!ok) return;
    setSaving(`delete-${instrument.id}`); setError('');
    try {
      await requestJson(`/api/admin/instruments?id=${encodeURIComponent(instrument.id)}`, { method: 'DELETE' });
      setInstruments(current => current.filter(item => item.id !== instrument.id));
      notify('시작 악기를 삭제했어요.');
    } catch (removeError) { setError(removeError.message); } finally { setSaving(''); }
  };

  return <>
    {dialog}
    <Section title="시작 악기" meta={`${instruments.filter(item => item.active).length}개 사용 중`} className="instrument-settings-card">
      <div className="instrument-settings-intro"><p>악보의 ‘○○ 시작’ 선택 항목을 교회 편성에 맞게 관리합니다.</p><button type="button" className="secondary-button" disabled={instruments.length >= 30 && !showForm} onClick={() => setShowForm(value => !value)}><Plus/> {showForm ? '입력 닫기' : instruments.length >= 30 ? '최대 30개' : '악기 추가'}</button></div>
      {showForm && <form className="instrument-create-form admin-pop-in" onSubmit={create}>
        <label><span>악기 이름</span><input autoFocus placeholder="예: 바이올린" value={form.label} onChange={event => setForm(current => ({ ...current, label: event.target.value }))}/></label>
        <label><span>정렬 순서</span><input type="number" value={form.sortOrder} onChange={event => setForm(current => ({ ...current, sortOrder: Number(event.target.value) }))}/></label>
        <div className="admin-form-actions"><button type="button" className="secondary-button" onClick={() => { setForm(empty); setShowForm(false); }}>취소</button><button type="submit" className="primary-button" disabled={!form.label.trim() || saving === 'create'}><Plus/> 추가</button></div>
      </form>}
      <ErrorNote message={error} onDismiss={() => setError('')}/>
      {loading ? <Loading/> : instruments.length ? <div className="instrument-preset-list">{instruments.map(instrument => {
        const dirty = isDirty(instrument);
        return <article key={instrument.id} className={instrument.active ? '' : 'inactive'}>
          <div className="instrument-preset-name"><Music2/><span><b>{instrument.label || '이름 없음'}</b><small>{instrument.usageCount ? `콘티 악보 ${instrument.usageCount}곳에서 사용` : '사용 기록 없음'}</small></span>{dirty && <i className="dirty-dot"/>}</div>
          <div className="instrument-preset-fields">
            <label><span>악기 이름</span><input value={instrument.label} onChange={event => updateLocal(instrument.id, { label: event.target.value })}/></label>
            <label><span>순서</span><input type="number" value={instrument.sortOrder} onChange={event => updateLocal(instrument.id, { sortOrder: Number(event.target.value) })}/></label>
            <label className="admin-switch"><span>사용</span><input type="checkbox" checked={instrument.active} onChange={event => updateLocal(instrument.id, { active: event.target.checked })}/><em>{instrument.active ? '사용 중' : '중지됨'}</em></label>
          </div>
          <div className="preset-actions">
            <button type="button" className="admin-action-button danger" disabled={instrument.usageCount > 0 || saving === `delete-${instrument.id}`} title={instrument.usageCount > 0 ? '기존 콘티에서 사용 중인 악기는 삭제할 수 없어요.' : undefined} onClick={() => remove(instrument)}><Trash2/> 삭제</button>
            <button type="button" className="admin-action-button primary" disabled={!dirty || saving === instrument.id} onClick={() => save(instrument)}><Save/> {saving === instrument.id ? '저장 중…' : '저장'}</button>
          </div>
        </article>;
      })}</div> : <EmptyState text="등록된 시작 악기가 없습니다." hint="악기 추가 버튼으로 교회 편성을 등록하세요."/>}
    </Section>
  </>;
}

function PresetsPanel({ notify, onChurchNameChange }) {
  const empty = { label: '', short: '', defaultTime: '', color: '#2563eb', sortOrder: 60, active: true };
  const [presets, setPresets] = useState([]);
  const [churchSettings, setChurchSettings] = useState({ churchName: '', defaultServiceType: '' });
  const [baseline, setBaseline] = useState({});
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const { confirm, dialog } = useConfirm();
  const formRef = useRef(null);

  useEffect(() => {
    if (showForm) scrollIntoViewIfNeeded(formRef.current);
  }, [showForm]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [presetData, settingsData] = await Promise.all([
        requestJson('/api/admin/service-presets'),
        requestJson('/api/settings'),
      ]);
      const list = presetData.presets || [];
      setPresets(list);
      setBaseline(Object.fromEntries(list.map(preset => [preset.id, preset])));
      setChurchSettings({
        churchName: settingsData.system?.churchName || '',
        defaultServiceType: settingsData.system?.defaultServiceType || list.find(preset => preset.active)?.id || '',
      });
      setError('');
    } catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const updateLocal = (id, patch) => setPresets(current => current.map(preset => preset.id === id ? { ...preset, ...patch } : preset));

  const isDirty = preset => {
    const original = baseline[preset.id];
    if (!original) return false;
    return ['label', 'short', 'defaultTime', 'color', 'sortOrder', 'active']
      .some(key => (preset[key] ?? '') !== (original[key] ?? ''));
  };

  const saveChurchSettings = async event => {
    event.preventDefault(); setSaving('church'); setError('');
    try {
      const data = await requestJson('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'system', ...churchSettings }),
      });
      setChurchSettings(data.system);
      onChurchNameChange?.(data.system.churchName);
      notify('교회 기본 설정을 저장했어요.');
    } catch (saveError) { setError(saveError.message); } finally { setSaving(''); }
  };

  const create = async event => {
    event.preventDefault(); setSaving('create'); setError('');
    try {
      await requestJson('/api/admin/service-presets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      setForm(empty); setShowForm(false); await load(); notify('예배 프리셋을 추가했어요.');
    } catch (createError) { setError(createError.message); } finally { setSaving(''); }
  };

  const save = async preset => {
    setSaving(preset.id); setError('');
    try {
      const saved = await requestJson('/api/admin/service-presets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preset) });
      updateLocal(preset.id, saved);
      setBaseline(current => ({ ...current, [preset.id]: { ...preset, ...saved } }));
      notify('예배 프리셋을 저장했어요.');
    } catch (saveError) { setError(saveError.message); } finally { setSaving(''); }
  };

  const remove = async preset => {
    const ok = await confirm({
      title: `“${preset.label}” 프리셋을 삭제할까요?`,
      body: preset.contiCount
        ? `이 프리셋을 쓰는 콘티가 ${preset.contiCount}개 있습니다. 삭제하면 해당 콘티의 예배 종류 표시가 사라집니다.`
        : '삭제한 프리셋은 되돌릴 수 없습니다.',
      confirmLabel: '삭제',
      tone: 'danger',
    });
    if (!ok) return;
    setSaving(`delete-${preset.id}`); setError('');
    try {
      await requestJson(`/api/admin/service-presets?id=${encodeURIComponent(preset.id)}`, { method: 'DELETE' });
      setPresets(current => current.filter(item => item.id !== preset.id));
      notify('예배 프리셋을 삭제했어요.');
    } catch (removeError) { setError(removeError.message); } finally { setSaving(''); }
  };

  return <>
    {dialog}
    <PanelHeading
      title="교회 설정"
      description="교회명과 기본 예배, 시작 악기, 예배 프리셋을 한곳에서 관리합니다."
      action={<button type="button" className="primary-button" onClick={() => setShowForm(value => !value)}>
        <Plus/> <span>{showForm ? '입력 닫기' : '프리셋 추가'}</span>
      </button>}
    />

    <Section title="교회 기본 설정" meta="전체 사용자 공통" className="church-settings-card">
      <form onSubmit={saveChurchSettings}>
        <label><span>교회명</span><input placeholder="예: 새빛교회" value={churchSettings.churchName} onChange={event => setChurchSettings(current => ({ ...current, churchName: event.target.value }))}/></label>
        <label><span>기본 예배</span><select value={churchSettings.defaultServiceType} onChange={event => setChurchSettings(current => ({ ...current, defaultServiceType: event.target.value }))} disabled={loading}>
          {presets.filter(preset => preset.active).map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        </select></label>
        <div className="admin-form-actions"><button type="submit" className="primary-button" disabled={loading || saving === 'church' || !churchSettings.defaultServiceType}><Save/> {saving === 'church' ? '저장 중…' : '기본 설정 저장'}</button></div>
      </form>
    </Section>

    <InstrumentPresetsSection notify={notify}/>

    {showForm && <div ref={formRef}><Section title="새 프리셋" meta="기본 시간은 비워둘 수 있어요." className="admin-create-card admin-pop-in">
      <form onSubmit={create}>
        <label><span>예배 이름</span><input placeholder="주일 1부 예배" value={form.label} onChange={event => setForm(current => ({ ...current, label: event.target.value }))}/></label>
        <label><span>짧은 이름</span><input placeholder="1부" value={form.short} onChange={event => setForm(current => ({ ...current, short: event.target.value }))}/></label>
        <label><span>기본 시간</span><input type="time" value={form.defaultTime} onChange={event => setForm(current => ({ ...current, defaultTime: event.target.value }))}/></label>
        <label><span>정렬 순서</span><input type="number" value={form.sortOrder} onChange={event => setForm(current => ({ ...current, sortOrder: Number(event.target.value) }))}/></label>
        <label className="color-field"><span>달력 색상</span>
          <div className="color-input"><input type="color" value={form.color} onChange={event => setForm(current => ({ ...current, color: event.target.value }))}/><em>{form.color}</em></div>
        </label>
        <div className="admin-form-actions">
          <button type="button" className="secondary-button" onClick={() => { setForm(empty); setShowForm(false); }}>취소</button>
          <button type="submit" className="primary-button" disabled={!form.label.trim() || saving === 'create'}><Plus/> 추가</button>
        </div>
      </form>
    </Section></div>}

    <ErrorNote message={error} onDismiss={() => setError('')}/>

    <Section title="등록된 프리셋" meta="정렬 순서가 작은 항목부터 표시" className="admin-list-card">
      {loading ? <Loading/> : presets.length ? <div className="preset-list">{presets.map(preset => {
        const dirty = isDirty(preset);
        return <article key={preset.id} className={preset.active ? '' : 'inactive'}>
          <div className="preset-head">
            <i className="preset-color" style={{ background: preset.color }}/>
            <div><b>{preset.label || '이름 없음'}</b><small>{preset.short ? `${preset.short} · ` : ''}콘티 {preset.contiCount}개</small></div>
            {dirty && <i className="dirty-dot" title="저장하지 않은 변경"/>}
          </div>
          <div className="preset-fields">
            <label><span>예배 이름</span><input value={preset.label} onChange={event => updateLocal(preset.id, { label: event.target.value })}/></label>
            <label><span>짧은 이름</span><input value={preset.short} onChange={event => updateLocal(preset.id, { short: event.target.value })}/></label>
            <label><span>기본 시간</span><input type="time" value={preset.defaultTime || ''} onChange={event => updateLocal(preset.id, { defaultTime: event.target.value })}/></label>
            <label><span>순서</span><input type="number" value={preset.sortOrder} onChange={event => updateLocal(preset.id, { sortOrder: Number(event.target.value) })}/></label>
            <label className="color-field"><span>색상</span>
              <div className="color-input"><input type="color" value={preset.color} onChange={event => updateLocal(preset.id, { color: event.target.value })}/><em>{preset.color}</em></div>
            </label>
            <label className="admin-switch">
              <span>사용</span>
              <input type="checkbox" checked={preset.active} onChange={event => updateLocal(preset.id, { active: event.target.checked })}/>
              <em>{preset.active ? '사용 중' : '중지됨'}</em>
            </label>
          </div>
          <div className="preset-actions">
            <button type="button" className="admin-action-button danger" disabled={saving === `delete-${preset.id}`} onClick={() => remove(preset)}><Trash2/> 삭제</button>
            <button type="button" className="admin-action-button primary" disabled={!dirty || saving === preset.id} onClick={() => save(preset)}>
              <Save/> {saving === preset.id ? '저장 중…' : '저장'}
            </button>
          </div>
        </article>;
      })}</div> : <EmptyState text="등록된 예배 프리셋이 없습니다." hint="위의 “프리셋 추가”로 첫 예배를 만들어 보세요."/>}
    </Section>
  </>;
}

/* ── 진행 알림 ─────────────────────────────────────────────── */

function SignalIconField({ value, color, onChange }) {
  return <label className="signal-icon-field"><span>아이콘</span><div>
    <i style={{ '--signal-color': color }}><FlowSignalIcon name={value}/></i>
    <select value={value} onChange={event => onChange(event.target.value)}>
      {FLOW_SIGNAL_ICON_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  </div></label>;
}

function FlowSignalsPanel({ notify }) {
  const empty = { label: '', shortLabel: '', icon: 'music-2', color: '#93c5fd', sortOrder: 50 };
  const [signals, setSignals] = useState([]);
  const [baseline, setBaseline] = useState({});
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const { confirm, dialog } = useConfirm();
  const formRef = useRef(null);

  useEffect(() => {
    if (showForm) scrollIntoViewIfNeeded(formRef.current);
  }, [showForm]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = (await requestJson('/api/admin/flow-signals')).signals || [];
      setSignals(list);
      setBaseline(Object.fromEntries(list.map(signal => [signal.id, signal])));
      setError('');
    } catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const updateLocal = (id, patch) => setSignals(current => current.map(signal => signal.id === id ? { ...signal, ...patch } : signal));
  const isDirty = signal => {
    const original = baseline[signal.id];
    return original && ['label', 'shortLabel', 'icon', 'color', 'sortOrder']
      .some(key => (signal[key] ?? '') !== (original[key] ?? ''));
  };
  const openCreate = () => {
    setForm({ ...empty, sortOrder: (signals.at(-1)?.sortOrder || signals.length * 10) + 10 });
    setShowForm(true);
  };
  const create = async event => {
    event.preventDefault(); setSaving('create'); setError('');
    try {
      await requestJson('/api/admin/flow-signals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      setForm(empty); setShowForm(false); await load(); notify('진행 알림을 추가했어요.');
    } catch (createError) { setError(createError.message); } finally { setSaving(''); }
  };
  const save = async signal => {
    setSaving(signal.id); setError('');
    try {
      await requestJson('/api/admin/flow-signals', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(signal),
      });
      await load();
      notify('진행 알림을 저장했어요.');
    } catch (saveError) { setError(saveError.message); } finally { setSaving(''); }
  };
  const remove = async signal => {
    const ok = await confirm({
      title: `“${signal.label}” 알림을 삭제할까요?`,
      body: '삭제하면 열려 있는 뷰어의 다음 데이터 갱신부터 진행 알림 버튼에서 제외됩니다.',
      confirmLabel: '삭제',
      tone: 'danger',
    });
    if (!ok) return;
    setSaving(`delete-${signal.id}`); setError('');
    try {
      await requestJson(`/api/admin/flow-signals?id=${encodeURIComponent(signal.id)}`, { method: 'DELETE' });
      setSignals(current => current.filter(item => item.id !== signal.id));
      setBaseline(current => { const next = { ...current }; delete next[signal.id]; return next; });
      notify('진행 알림을 삭제했어요.');
    } catch (removeError) { setError(removeError.message); } finally { setSaving(''); }
  };

  return <>
    {dialog}
    <PanelHeading
      title="진행 알림"
      description="인도자가 뷰어에서 보낼 실시간 알림의 이름과 아이콘, 색상을 구성합니다."
      action={<button type="button" className="primary-button" disabled={signals.length >= 5} onClick={() => showForm ? setShowForm(false) : openCreate()}>
        <Plus/> <span>{showForm ? '입력 닫기' : signals.length >= 5 ? '최대 5개' : '알림 추가'}</span>
      </button>}
    />

    {showForm && <div ref={formRef}><Section title="새 진행 알림" meta={`${signals.length + 1} / 5`} className="admin-create-card admin-pop-in signal-create-card">
      <form onSubmit={create}>
        <label><span>알림 문구</span><input maxLength={30} placeholder="예: 다음 곡으로" value={form.label} onChange={event => setForm(current => ({ ...current, label: event.target.value }))}/></label>
        <label><span>버튼 이름</span><input maxLength={12} placeholder="예: 다음 곡" value={form.shortLabel} onChange={event => setForm(current => ({ ...current, shortLabel: event.target.value }))}/></label>
        <SignalIconField value={form.icon} color={form.color} onChange={icon => setForm(current => ({ ...current, icon }))}/>
        <label className="color-field"><span>색상</span><div className="color-input"><input type="color" value={form.color} onChange={event => setForm(current => ({ ...current, color: event.target.value }))}/><em>{form.color}</em></div></label>
        <label><span>순서</span><input type="number" min="0" max="999" value={form.sortOrder} onChange={event => setForm(current => ({ ...current, sortOrder: Number(event.target.value) }))}/></label>
        <div className="admin-form-actions"><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>취소</button><button type="submit" className="primary-button" disabled={!form.label.trim() || !form.shortLabel.trim() || saving === 'create'}><Plus/> 추가</button></div>
      </form>
    </Section></div>}

    <ErrorNote message={error} onDismiss={() => setError('')}/>

    <Section title="사용 중인 알림" meta={`${signals.length} / 5 · 순서가 작은 항목부터 표시`} className="admin-list-card">
      {loading ? <Loading/> : signals.length ? <div className="signal-preset-list">{signals.map(signal => {
        const dirty = isDirty(signal);
        return <article key={signal.id}>
          <div className="signal-preset-preview" style={{ '--signal-color': signal.color }}><FlowSignalIcon name={signal.icon}/><span><b>{signal.label || '이름 없음'}</b><small>버튼: {signal.shortLabel || '미입력'}</small></span>{dirty && <i className="dirty-dot" title="저장하지 않은 변경"/>}</div>
          <div className="signal-preset-fields">
            <label><span>알림 문구</span><input maxLength={30} value={signal.label} onChange={event => updateLocal(signal.id, { label: event.target.value })}/></label>
            <label><span>버튼 이름</span><input maxLength={12} value={signal.shortLabel} onChange={event => updateLocal(signal.id, { shortLabel: event.target.value })}/></label>
            <SignalIconField value={signal.icon} color={signal.color} onChange={icon => updateLocal(signal.id, { icon })}/>
            <label className="color-field"><span>색상</span><div className="color-input"><input type="color" value={signal.color} onChange={event => updateLocal(signal.id, { color: event.target.value })}/><em>{signal.color}</em></div></label>
            <label><span>순서</span><input type="number" min="0" max="999" value={signal.sortOrder} onChange={event => updateLocal(signal.id, { sortOrder: Number(event.target.value) })}/></label>
          </div>
          <div className="preset-actions">
            <button type="button" className="admin-action-button danger" disabled={saving === `delete-${signal.id}`} onClick={() => remove(signal)}><Trash2/> 삭제</button>
            <button type="button" className="admin-action-button primary" disabled={!dirty || saving === signal.id} onClick={() => save(signal)}><Save/> {saving === signal.id ? '저장 중…' : '저장'}</button>
          </div>
        </article>;
      })}</div> : <EmptyState text="사용할 진행 알림이 없습니다." hint="위의 “알림 추가”로 첫 알림을 만들어 보세요."/>}
    </Section>
  </>;
}

/* ── 시스템 ────────────────────────────────────────────────── */

function SystemPanel({ notify }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try { setStatus(await requestJson('/api/admin/system')); setError(''); }
    catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const cleanup = async () => {
    const pending = status?.maintenance.pending;
    const ok = await confirm({
      title: '사용하지 않는 데이터를 정리할까요?',
      body: `어떤 콘티에서도 쓰지 않는 찬양 ${pending?.songs || 0}개와 악보 ${pending?.images || 0}개(${formatBytes(pending?.bytes)})가 완전히 삭제됩니다.`,
      confirmLabel: '지금 정리',
      tone: 'danger',
    });
    if (!ok) return;
    setRunning(true); setError('');
    try {
      const data = await requestJson('/api/admin/maintenance', { method: 'POST' });
      const result = data.result || {};
      notify(`찬양 ${result.songsDeleted || 0}개, 악보 ${result.imagesDeleted || 0}개를 정리했어요.`);
      await load();
    } catch (runError) { setError(runError.message); } finally { setRunning(false); }
  };

  return <>
    {dialog}
    <PanelHeading
      title="시스템 상태"
      description="운영에 필요한 연결과 저장 공간, 자동 처리 상태를 확인합니다."
      action={<button type="button" className="secondary-button" onClick={load}><RefreshCw/> <span>다시 확인</span></button>}
    />

    <ErrorNote message={error} onDismiss={() => setError('')}/>

    {loading || !status ? <Loading label="상태를 확인하고 있어요."/> : <>
      <div className="stat-grid">
        <StatCard icon={Database} label="데이터베이스" value={`${status.database.latencyMs}ms`} sub="정상" tone="ok"/>
        <StatCard icon={HardDrive} label="악보 저장소" value={formatBytes(status.counts.imageBytes)} sub={status.storage.ok ? `여유 ${formatBytes(status.storage.freeBytes)}` : '확인 필요'} tone={status.storage.ok ? 'ok' : 'bad'}/>
        <StatCard icon={Search} label="이미지 검색" value={status.integrations.imageSearch ? '설정됨' : '미설정'} sub="카카오 API" tone={status.integrations.imageSearch ? 'ok' : 'warn'}/>
        <StatCard icon={KeyRound} label="Key 인식 대기" value={status.keyQueue.pending + status.keyQueue.working} sub={status.keyQueue.failed ? `실패 ${status.keyQueue.failed}건` : '실패 없음'} tone={status.keyQueue.failed ? 'warn' : 'ok'}/>
      </div>

      <Section title="사용 현황" meta={`확인 ${new Date(status.checkedAt).toLocaleString('ko-KR')}`}>
        <div className="system-counts">
          <span><b>{status.counts.activeUsers}</b>사용자</span>
          <span><b>{status.counts.activeSessions}</b>로그인 세션</span>
          <span><b>{status.counts.contis}</b>콘티</span>
          <span><b>{status.counts.images}</b>악보</span>
          <span><b>{status.counts.activeShares}</b>공유 링크</span>
        </div>
      </Section>

      <Section title="자동 처리">
        <ul className="system-lines">
          <li><span>PDF 제목 OCR</span><StatusPill tone={status.integrations.pdfOcr ? 'ok' : 'warn'}>{status.integrations.pdfOcr ? '사용 가능' : '도구 확인 필요'}</StatusPill></li>
          <li><span>악보 Key 자동 인식</span><StatusPill tone={status.keyQueue.available ? 'ok' : 'warn'}>{status.keyQueue.available ? (status.keyQueue.running ? '작동 중' : '사용 가능') : '미설정'}</StatusPill></li>
          <li><span>마지막 저장소 정리</span><b>{status.maintenance.lastRunAt || '실행 기록 없음'}</b></li>
        </ul>
      </Section>

      <Section title="저장소 정리" className="cleanup-card">
        <div className="system-cleanup">
          <div>
            <b>사용하지 않는 데이터</b>
            <small>찬양 {status.maintenance.pending.songs}개 · 악보 {status.maintenance.pending.images}개 · {formatBytes(status.maintenance.pending.bytes)}</small>
          </div>
          <button type="button" className="danger-button" disabled={running} onClick={cleanup}>{running ? '정리 중…' : '지금 정리'}</button>
        </div>
      </Section>
    </>}
  </>;
}
