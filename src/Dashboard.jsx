"use client";

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, FileImage, Maximize2, MoreHorizontal } from 'lucide-react';
import { TODAY, iso } from './appUtils.js';

export function Calendar({ month, setMonth, selected, setSelected, contis, events, servicePresets = [] }) {
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

export function ContiCard({ conti, onView, onEdit }) {
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

export function RecentSection({ contis, onView, onAll, servicePresets = [] }) {
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
