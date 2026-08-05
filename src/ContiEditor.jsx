"use client";

import React, { useEffect, useRef, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft, Check, ChevronDown, ChevronRight, ExternalLink, FileImage, FileText,
  GripVertical, ImagePlus, ListMusic, Maximize2, Plus, Search, Trash2, Upload, X,
} from 'lucide-react';
import { ModalShell, SongLibraryPicker } from './AppModals.jsx';
import { selectableInstruments, serviceDefaultTime } from './appUtils.js';

export default function ContiEditor({
  initial, mode, eventId, selectedDate, events = [], songs, defaultServiceType,
  currentUser, isAdmin, leaderOptions = [], servicePresets = [],
  instrumentPresets = [], onClose, onSave, onDelete,
}) {
  const activeServicePresets = servicePresets.filter(preset => preset.active || preset.id === initial?.serviceType);
  const [form, setForm] = useState(() => {
    if (initial) return {
      ...initial,
      time: initial.time || '',
      ...(!isAdmin ? { leader: currentUser.displayName, ownerUserId: currentUser.id } : {}),
    };
    const serviceType = mode === 'regular' ? (defaultServiceType || activeServicePresets[0]?.id || '') : 'event';
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
      : (current.serviceType === 'event' ? (defaultServiceType || activeServicePresets[0]?.id || '') : current.serviceType);
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
