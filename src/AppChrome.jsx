"use client";

import React, { useEffect, useState } from 'react';
import {
  Archive, CalendarDays, ChevronDown, ListMusic, MoreHorizontal, Music2,
  PanelLeftClose, Plus, Settings, ShieldCheck, X,
} from 'lucide-react';
import { TODAY } from './appUtils.js';

export function Logo({ compact = false, churchName = '' }) {
  const church = churchName.trim();
  return <div className={`logo ${compact ? 'compact' : ''}`}>
    <div className="logo-mark"><Music2 size={21}/></div>
    <div className="logo-copy">
      <b title={church || '찬양이음'}>{church || '찬양이음'}</b>
      <span>{church ? '찬양이음' : '찬양팀 콘티 관리'}</span>
    </div>
  </div>;
}

export function Sidebar({
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
