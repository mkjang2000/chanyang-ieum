"use client";

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, ListMusic, Minus, Plus, Search, Upload, X } from 'lucide-react';
import { ImageSearch } from './ContiEditor.jsx';
import { SongLibraryPicker } from './AppModals.jsx';

const statuses = { pending: '승인 대기', approved: '반영 완료', rejected: '반려', cancelled: '요청 취소' };

export async function requestApi(contiId, options = {}) {
  const response = await fetch(`/api/contis/change-requests?contiId=${encodeURIComponent(contiId)}`, {
    cache: 'no-store', ...options,
    ...(options.body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contiId, ...options.body }) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || '변경 요청을 처리하지 못했어요.');
  return data;
}

function ComparisonImage({ label, image, keyName }) {
  const [zoom, setZoom] = useState(100);
  const [failed, setFailed] = useState(false);
  const viewport = useRef(null);
  const drag = useRef(null);
  return <section className="request-score">
    <div className="request-score-heading"><b>{label} <em>Key {keyName || '미정'}</em></b><div>
      <button type="button" aria-label={`${label} 축소`} disabled={zoom <= 50} onClick={() => setZoom(value => Math.max(50, value - 25))}><Minus size={16}/></button>
      <button type="button" aria-label={`${label} 배율 초기화`} onClick={() => setZoom(100)}>{zoom}%</button>
      <button type="button" aria-label={`${label} 확대`} disabled={zoom >= 300} onClick={() => setZoom(value => Math.min(300, value + 25))}><Plus size={16}/></button>
    </div></div>
    <div className="request-score-viewport" ref={viewport} tabIndex={0} aria-label={`${label}, 스크롤하거나 드래그하여 이동`}
      onPointerDown={event => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        drag.current = { x: event.clientX, y: event.clientY, left: viewport.current.scrollLeft, top: viewport.current.scrollTop };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        if (!drag.current) return;
        viewport.current.scrollLeft = drag.current.left + drag.current.x - event.clientX;
        viewport.current.scrollTop = drag.current.top + drag.current.y - event.clientY;
      }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}>
      {failed && <p role="alert">악보를 불러오지 못했어요. 연결을 확인하고 다시 열어 주세요.</p>}
      <img src={image} alt={`${label} 악보`} draggable={false} style={{ width: `${zoom}%` }} onError={() => setFailed(true)}/>
    </div>
  </section>;
}

function ScoreComparison({ before, proposed, beforeKey, proposedKey, history = false }) {
  const [layout, setLayout] = useState(() => typeof window !== 'undefined' && window.innerWidth < 700 ? 'vertical' : 'horizontal');
  return <div className="request-comparison">
    <div className="request-comparison-tools"><span>각 악보를 확대하거나 움직여 비교하세요.</span><div aria-label="악보 배치">
      <button type="button" aria-pressed={layout === 'horizontal'} onClick={() => setLayout('horizontal')}>좌우</button>
      <button type="button" aria-pressed={layout === 'vertical'} onClick={() => setLayout('vertical')}>상하</button>
    </div></div>
    <div className={`request-scores ${layout}`}>
      <ComparisonImage key={`before-${before}`} label={history ? '요청 당시 악보' : '현재 악보'} image={before} keyName={beforeKey}/>
      <ComparisonImage key={`proposed-${proposed}`} label="요청 악보" image={proposed} keyName={proposedKey}/>
    </div>
  </div>;
}

export default function ChangeRequests({ conti, currentUser, songs, initialItemId, requests, loading, loadError, onRefresh, onContiChange, onClose }) {
  const accompanist = currentUser.role === 'accompanist';
  const [tab, setTab] = useState('primary');
  const [selectedId, setSelectedId] = useState(null);
  // 원본은 작성 시작 시점으로 고정해 제출 도중 원본 변경도 감지한다.
  const [original, setOriginal] = useState(() => conti.pages.find(item => item.id === initialItemId) || conti.pages[0]);
  const [proposed, setProposed] = useState(original);
  const [keyName, setKeyName] = useState(original?.key || '');
  const [reason, setReason] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [search, setSearch] = useState(false);
  const [library, setLibrary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileRef = useRef(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const handle = event => {
      if (event.key === 'Tab') {
        const root = dialogRef.current?.querySelector('.nested-modal') || dialogRef.current;
        const focusable = [...(root?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') || [])].filter(element => element.getClientRects().length);
        const first = focusable[0]; const last = focusable.at(-1);
        if (!first) return;
        if (!root.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault(); (event.shiftKey ? last : first).focus();
        }
        return;
      }
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      event.preventDefault();
      if (busy) return;
      if (search) setSearch(false);
      else if (library) setLibrary(false);
      else closeRef.current();
    };
    document.addEventListener('keydown', handle, true);
    return () => document.removeEventListener('keydown', handle, true);
  }, [busy, search, library]);
  const selected = requests.find(item => item.id === selectedId);
  const pending = requests.filter(item => item.status === 'pending');
  const list = tab === 'primary' ? pending : requests.filter(item => accompanist || item.status !== 'pending');
  const duplicate = pending.find(item => item.itemId === original?.id);
  const switchTab = value => { setTab(value); setSelectedId(null); setError(''); setRejecting(false); };
  const chooseSong = id => {
    const item = conti.pages.find(page => page.id === id);
    setOriginal(item); setProposed(item); setKeyName(item?.key || ''); setReason(''); setError(''); setNotice('');
  };
  const chooseImage = image => {
    setProposed(image);
    if (image.key) setKeyName(image.key);
    setSearch(false); setLibrary(false); setError('');
  };
  const upload = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 25 * 1024 * 1024) {
      setError('25MB 이하의 이미지 파일을 선택해 주세요.'); return;
    }
    setBusy(true);
    try {
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('이미지를 읽지 못했어요.')); reader.readAsDataURL(file);
      });
      chooseImage({ image, sourceType: 'upload' });
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await requestApi(conti.id, { method: 'POST', body: {
        itemId: original.id, title: original.title,
        beforeImageId: original.imageId, beforeKey: original.key || '', beforeContiKey: original.contiKey || '',
        key: keyName.trim(), reason, image: proposed.image, imageId: proposed.imageId,
        sourceUrl: proposed.sourceUrl, sourceType: proposed.sourceType,
      } });
      await onRefresh(); setTab('history'); setSelectedId(data.id);
      setNotice('변경을 요청했어요. 인도자가 승인하면 콘티에 반영됩니다.');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const review = async action => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await requestApi(conti.id, { method: 'PATCH', body: { id: selected.id, action, reviewReason } });
      if (result.conti) onContiChange(result.conti);
      await onRefresh(); setTab('history'); setRejecting(false);
      setNotice({ approve: 'Key와 악보를 콘티에 반영했어요.', reject: '요청을 반려했어요.', cancel: '요청을 취소했어요.' }[action]);
    } catch (failure) { setError(failure.message); await onRefresh(); }
    finally { setBusy(false); }
  };
  const dirty = original && proposed && (keyName.trim() !== (original.key || '') || proposed.image !== original.image);
  return <div className="change-request-overlay" role="dialog" aria-modal="true" aria-label="변경 요청">
    <div className="modal change-request-dialog" ref={dialogRef}>
      <header className="modal-header request-header"><div><h2>변경 요청</h2><p>{conti.title}</p></div><button className="modal-close" autoFocus type="button" disabled={busy} aria-label="변경 요청 닫기" onClick={onClose}><X/></button></header>
      <div className="request-tabs" role="tablist" aria-label="변경 요청 메뉴">
        <button role="tab" aria-selected={tab === 'primary'} disabled={busy} onClick={() => switchTab('primary')}>{accompanist ? '변경신청' : <>승인대기 <b>{pending.length}</b></>}</button>
        <button role="tab" aria-selected={tab === 'history'} disabled={busy} onClick={() => switchTab('history')}>이력확인</button>
        <button className="request-refresh" disabled={loading || busy} onClick={onRefresh}>새로고침</button>
      </div>
      {(error || loadError) && <div className="request-message error" role="alert">{error || loadError}</div>}
      {notice && <div className="request-message" role="status">{notice}</div>}
      <div className="request-body" role="tabpanel">
        {accompanist && tab === 'primary' ? <>
          <div className="request-form-fields">
            <label>변경할 곡<select disabled={busy} value={original?.id || ''} onChange={event => chooseSong(event.target.value)}>{conti.pages.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.title}</option>)}</select></label>
            <label>요청할 Key<input disabled={busy} maxLength={32} value={keyName} onChange={event => setKeyName(event.target.value)} placeholder="예: A, Bb, F#m"/></label>
          </div>
          {duplicate && <div className="request-message">이 곡에 승인 대기 중인 요청이 있어요. <button onClick={() => { setTab('history'); setSelectedId(duplicate.id); }}>내 요청 확인</button></div>}
          <div className="request-image-actions">
            <button className="secondary-button" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={16}/> 이미지 업로드</button>
            <button className="secondary-button" disabled={busy} onClick={() => setSearch(true)}><Search size={16}/> 악보 검색</button>
            <button className="secondary-button" disabled={busy} onClick={() => setLibrary(true)}><ListMusic size={16}/> 저장된 악보</button>
            <input hidden type="file" accept="image/*" ref={fileRef} onChange={upload}/>
          </div>
          {original && proposed && <ScoreComparison before={original.image} beforeKey={original.key} proposed={proposed.image} proposedKey={keyName}/>}
          <label className="request-reason">요청 사유 <span>선택</span><textarea disabled={busy} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} placeholder="변경이 필요한 이유를 알려 주세요."/></label>
          <p className="request-hint">인도자가 승인하면 반영됩니다. Key만 입력해도 악보 이미지가 자동으로 조옮김되지는 않아요.</p>
        </> : selected ? <>
          <button className="request-back" disabled={busy} onClick={() => { setSelectedId(null); setRejecting(false); setError(''); }}><ArrowLeft size={16}/> 목록으로</button>
          <div className="request-detail-heading"><h3>{selected.title}</h3><span className={`request-status ${selected.status}`}>{statuses[selected.status]}</span></div>
          <p className="request-meta">{selected.requesterName} · {selected.createdAt}</p>
          <p className="request-reason-copy">{selected.reason || '요청 사유 없음'}</p>
          {selected.stale && <div className="request-message error">요청 이후 원본이 변경되었거나 곡이 삭제됐어요. 이 요청은 승인할 수 없으며, 최신 콘티에서 다시 신청해야 합니다.</div>}
          <ScoreComparison before={selected.beforeImage} proposed={selected.proposedImage} beforeKey={selected.beforeKey} proposedKey={selected.proposedKey} history/>
          {selected.status !== 'pending' && <div className="request-outcome"><b>{statuses[selected.status]}</b><p>{selected.reviewerName} · {selected.reviewedAt}</p>{selected.status === 'rejected' && <p>반려 사유: {selected.reviewReason || '없음'}</p>}</div>}
          {rejecting && <label className="request-reason">반려 사유 <span>선택</span><textarea autoFocus disabled={busy} maxLength={2000} value={reviewReason} onChange={event => setReviewReason(event.target.value)} placeholder="반주자에게 전달할 내용을 적어 주세요."/></label>}
        </> : <>
          <p className="request-list-caption">{accompanist ? '이 콘티에 내가 신청한 변경과 처리 결과입니다.' : tab === 'primary' ? '요청을 선택해 두 악보를 비교한 뒤 처리하세요.' : '이 콘티에서 처리한 요청을 확인하세요.'}</p>
          {loading && !requests.length ? <p className="request-empty">불러오는 중…</p> : !list.length ? <p className="request-empty">{tab === 'primary' ? '승인 대기 중인 요청이 없어요.' : '아직 요청 이력이 없어요.'}</p> : <div className="request-list">{list.map(item => <button key={item.id} onClick={() => { setSelectedId(item.id); setReviewReason(''); setRejecting(false); setNotice(''); }}>
            <div><b>{item.title}</b><small>{item.requesterName} · {item.createdAt}</small><span>Key {item.beforeKey || '미정'} → {item.proposedKey || '미정'} · {item.beforeImageId === item.proposedImageId ? '동일 악보' : '악보 교체'}</span>{item.stale && <small className="request-stale">원본 변경됨 · 재요청 필요</small>}</div>
            <span className={`request-status ${item.status}`}>{statuses[item.status]}</span><ChevronRight size={18}/>
          </button>)}</div>}
        </>}
      </div>
      <footer className="modal-footer request-footer">
        <button className="secondary-button" disabled={busy} onClick={onClose}>닫기</button>
        {accompanist && tab === 'primary' && <button className="primary-button" disabled={busy || loading || Boolean(loadError) || !dirty || !keyName.trim() || Boolean(duplicate)} onClick={submit}>{busy ? '저장 중…' : '요청 보내기'}</button>}
        {!(accompanist && tab === 'primary') && selected?.status === 'pending' && (accompanist ? <button className="secondary-button" disabled={busy} onClick={() => review('cancel')}>요청 취소</button> : <>
          <button className="secondary-button" disabled={busy} onClick={() => rejecting ? review('reject') : setRejecting(true)}>{rejecting ? '반려 확정' : '반려'}</button>
          {rejecting ? <button className="secondary-button" disabled={busy} onClick={() => setRejecting(false)}>반려 취소</button> : <button className="primary-button" disabled={busy || selected.stale} onClick={() => review('approve')}><Check size={16}/>{busy ? '처리 중…' : '승인하고 반영'}</button>}
        </>)}
      </footer>
      {search && <ImageSearch initialQuery={`${original.title} ${keyName}`} onClose={() => setSearch(false)} onSelect={chooseImage}/>}
      {library && <SongLibraryPicker songs={songs} onClose={() => setLibrary(false)} onSelect={(_song, image) => chooseImage(image)}/>}
    </div>
  </div>;
}
