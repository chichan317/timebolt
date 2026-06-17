import { useEffect, useMemo, useState } from 'react';
import { saveSettings, uid } from '../db';
import type { ClockCity, Settings } from '../types';
import {
  CITY_PRESETS,
  DEFAULT_CLOCKS,
  dayDiff,
  dayStartUtc,
  formatDate,
  formatTime,
  hourCategory,
  localDateKey,
  localMinutesOfDay,
  offsetLabel,
} from '../lib/clock';
import { Icon } from './ui';

interface ClocksProps {
  settings: Settings;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDayStr(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + delta * DAY_MS;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate(),
  ).padStart(2, '0')}`;
}

export function Clocks({ settings }: ClocksProps) {
  const cities = settings.clocks && settings.clocks.length > 0 ? settings.clocks : DEFAULT_CLOCKS;

  const [refCityId, setRefCityId] = useState(cities[0].id);
  const refCity = cities.find((c) => c.id === refCityId) ?? cities[0];
  const refTz = refCity.timeZone;

  const [live, setLive] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [dateStr, setDateStr] = useState(() => localDateKey(Date.now(), refTz));
  const [minutes, setMinutes] = useState(() => localMinutesOfDay(Date.now(), refTz));

  // Tick every second while live.
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live]);

  const effectiveDate = live ? localDateKey(nowMs, refTz) : dateStr;
  const windowStart = useMemo(() => dayStartUtc(effectiveDate, refTz), [effectiveDate, refTz]);
  const selectedMs = live ? nowMs : windowStart + minutes * 60000;
  const sliderValue = live
    ? Math.min(1439, Math.max(0, Math.round((nowMs - windowStart) / 60000)))
    : minutes;

  const leftPct = Math.min(100, Math.max(0, ((selectedMs - windowStart) / DAY_MS) * 100));

  const leaveLive = () => {
    if (live) {
      setDateStr(effectiveDate);
      setLive(false);
    }
  };

  const onSlider = (v: number) => {
    leaveLive();
    setMinutes(v);
  };

  const goNow = () => {
    setNowMs(Date.now());
    setLive(true);
  };

  const shiftDay = (delta: number) => {
    leaveLive();
    setDateStr((d) => addDayStr(live ? effectiveDate : d, delta));
  };

  /* ------------------------------ city management ------------------------- */

  const available = CITY_PRESETS.filter((p) => !cities.some((c) => c.timeZone === p.timeZone));
  const [toAdd, setToAdd] = useState('');

  const addCity = () => {
    const preset = CITY_PRESETS.find((p) => p.timeZone === toAdd) ?? available[0];
    if (!preset) return;
    const next: ClockCity = { id: uid(), label: preset.label, timeZone: preset.timeZone };
    void saveSettings({ clocks: [...cities, next] });
    setToAdd('');
  };

  const removeCity = (id: string) => {
    if (cities.length <= 1) return;
    const next = cities.filter((c) => c.id !== id);
    void saveSettings({ clocks: next });
    if (refCityId === id) setRefCityId(next[0].id);
  };

  /* --------------------------------- render -------------------------------- */

  return (
    <div className="page clocks-page">
      <div className="page-toolbar">
        <h1>Clocks</h1>
        <div className="toolbar-actions">
          {available.length > 0 && (
            <>
              <select
                className="clock-add-select"
                value={toAdd}
                onChange={(e) => setToAdd(e.target.value)}
                aria-label="City to add"
              >
                <option value="">Add a city…</option>
                {available.map((p) => (
                  <option key={p.timeZone} value={p.timeZone}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-sm btn-icon"
                onClick={addCity}
                disabled={toAdd === ''}
                type="button"
              >
                <Icon name="plus" size={14} /> Add
              </button>
            </>
          )}
        </div>
      </div>

      <section className="panel clocks-converter">
        <div className="clocks-controls">
          <label className="field">
            <span>Reference city</span>
            <select value={refCityId} onChange={(e) => setRefCityId(e.target.value)}>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Date</span>
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => {
                setLive(false);
                setDateStr(e.target.value);
              }}
            />
          </label>
          <div className="clocks-nav">
            <button className="icon-btn" onClick={() => shiftDay(-1)} aria-label="Previous day" type="button">
              ‹
            </button>
            <button
              className={`btn btn-sm ${live ? 'btn-primary' : ''}`}
              onClick={goNow}
              type="button"
            >
              Now
            </button>
            <button className="icon-btn" onClick={() => shiftDay(1)} aria-label="Next day" type="button">
              ›
            </button>
          </div>
        </div>

        <div className="clocks-refline">
          <span className="clocks-ref-time">{formatTime(selectedMs, refTz)}</span>
          <span className="clocks-ref-date">
            {formatDate(selectedMs, refTz)} · {refCity.label}
            {live && <span className="clocks-live-dot" aria-label="live" />}
          </span>
        </div>

        <input
          className="clocks-slider"
          type="range"
          min={0}
          max={1439}
          step={15}
          value={sliderValue}
          onChange={(e) => onSlider(Number(e.target.value))}
          aria-label="Adjust time"
        />

        <div className="clocks-grid">
          {cities.map((city) => {
            const diff = dayDiff(selectedMs, city.timeZone, refTz);
            return (
              <div
                key={city.id}
                className={`clock-row ${city.id === refCityId ? 'clock-row-ref' : ''}`}
              >
                <div className="clock-head">
                  <span className="clock-name">{city.label}</span>
                  <span className="clock-offset">{offsetLabel(selectedMs, city.timeZone)}</span>
                  {cities.length > 1 && (
                    <button
                      className="clock-remove"
                      onClick={() => removeCity(city.id)}
                      aria-label={`Remove ${city.label}`}
                      title="Remove city"
                      type="button"
                    >
                      <Icon name="x" size={12} />
                    </button>
                  )}
                </div>
                <div className="clock-when">
                  <span className="clock-time">{formatTime(selectedMs, city.timeZone)}</span>
                  <span className="clock-date">
                    {formatDate(selectedMs, city.timeZone)}
                    {diff !== 0 && (
                      <span className="clock-daydiff">
                        {diff > 0 ? `+${diff} day` : `${diff} day`}
                      </span>
                    )}
                  </span>
                </div>
                <div className="clock-bar">
                  {Array.from({ length: 24 }, (_, h) => {
                    const segMs = windowStart + h * 3600000;
                    const hour = Math.floor(localMinutesOfDay(segMs, city.timeZone) / 60);
                    return <span key={h} className={`clock-seg seg-${hourCategory(hour)}`} />;
                  })}
                  <span className="clock-marker" style={{ left: `${leftPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="clocks-legend" aria-hidden="true">
          <span className="legend-item">
            <span className="clock-seg seg-day" /> Working hours
          </span>
          <span className="legend-item">
            <span className="clock-seg seg-fringe" /> Early / late
          </span>
          <span className="legend-item">
            <span className="clock-seg seg-night" /> Night
          </span>
        </div>
      </section>
    </div>
  );
}
