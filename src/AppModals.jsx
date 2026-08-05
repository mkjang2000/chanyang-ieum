"use client";

import React, { useEffect, useRef, useState } from 'react';
import {
  Archive, ArrowLeft, Check, ChevronRight, Copy, ExternalLink, FileImage, Folder,
  FolderPlus, Link2, ListMusic, Music2, Plus, Search, Trash2, X,
} from 'lucide-react';
import { TODAY, dateKo, iso } from './appUtils.js';

let openModalCount = 0;

export function ModalShell({ children, onClose, wide = false, viewer = false, modalRef = null }) {
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

export function EventEditor({ initial, onClose, onSave, onDelete }) {
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

export function LibraryModal({ songs, onClose }) {
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

export function SongLibraryPicker({ songs, onClose, onSelect }) {
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

export function ArchiveModal({ contis, initialScope = 'past', onClose, onView }) {
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

export function ShareModal({ conti, onClose }) {
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
