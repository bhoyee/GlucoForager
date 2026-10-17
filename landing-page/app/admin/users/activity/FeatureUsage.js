'use client';

// Feature usage chart for the admin Activity page: which features people actually use.
// Counts come from /api/admin/user-activity/feature-usage (one count per real use,
// not raw event rows). Refreshes silently every minute while the tab is visible.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const RANGES = [7, 14, 30];
const REFRESH_MS = 60000;
const SERIES_COLORS = ['#1D7C7A', '#2B6CB0', '#DD6B20', '#2C8632', '#805AD5', '#C53030'];

function timeAgo(ts, now) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

function Change({ pct, prevUses }) {
  if (pct === null || pct === undefined) {
    return <span style={{ color: '#9CA3AF', fontSize: 12 }}>{prevUses ? '' : 'new'}</span>;
  }
  const up = pct > 0;
  const flat = pct === 0;
  return (
    <span style={{ fontSize: 12, fontWeight: 800, color: flat ? '#6B7280' : up ? '#2C8632' : '#B7791F' }}>
      {flat ? '–' : up ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  );
}

function TrendChart({ dates, series, keys, labels }) {
  const W = 640;
  const H = 200;
  const pad = { l: 34, r: 10, t: 10, b: 26 };
  const max = Math.max(1, ...keys.flatMap((k) => series[k] || []));
  const n = dates.length;
  const x = (i) => pad.l + (n <= 1 ? 0 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const ticks = [0, Math.ceil(max / 2), max];
  const labelEvery = n > 14 ? 5 : n > 7 ? 2 : 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Daily usage trend">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#EEF0EA" />
          <text x={pad.l - 6} y={y(t) + 4} fontSize="10" textAnchor="end" fill="#9CA3AF">{t}</text>
        </g>
      ))}
      {dates.map((d, i) =>
        i % labelEvery === 0 || i === n - 1 ? (
          <text key={d} x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="#9CA3AF">
            {new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
          </text>
        ) : null
      )}
      {keys.map((k, si) => {
        const pts = (series[k] || []).map((v, i) => `${x(i)},${y(v)}`).join(' ');
        const color = SERIES_COLORS[si % SERIES_COLORS.length];
        return (
          <g key={k}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {(series[k] || []).map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={n > 14 ? 2 : 3} fill={color}>
                <title>{`${labels[k]} · ${dates[i]}: ${v}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export default function FeatureUsage({ token, onUnauthorized }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState(null); // null = top features automatically
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`${API_URL}/api/admin/user-activity/feature-usage?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onUnauthorized?.();
        return;
      }
      if (!res.ok) throw new Error('failed');
      setData(await res.json());
      setLoadedAt(Date.now());
      setError('');
    } catch {
      // Silent refresh: keep the last good data on screen and just note the failure.
      setError('Could not refresh. Showing the last loaded numbers.');
    } finally {
      inFlight.current = false;
    }
  }, [days, onUnauthorized, token]);

  useEffect(() => {
    load();
    const refresh = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(tick);
  }, []);

  const features = data?.features || [];
  const maxUses = Math.max(1, ...features.map((f) => f.uses));
  const labels = useMemo(() => Object.fromEntries(features.map((f) => [f.key, f.label])), [features]);
  const trendKeys = useMemo(() => {
    if (selected?.length) return selected;
    return features.filter((f) => f.uses > 0).slice(0, 4).map((f) => f.key);
  }, [features, selected]);

  const toggle = (key) => {
    setSelected((cur) => {
      const base = cur?.length ? cur : trendKeys;
      if (base.includes(key)) {
        const next = base.filter((k) => k !== key);
        return next.length ? next : null;
      }
      return [...base, key].slice(-6);
    });
  };

  return (
    <section className="admin-card" style={{ marginBottom: 16 }}>
      <div className="admin-card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 className="admin-title--sm">Feature usage</h2>
          <p className="admin-subtitle--sm">
            Which features people actually use. Each use counted once.{' '}
            {data ? (
              <>
                <b>{data.active_users}</b> active user{data.active_users === 1 ? '' : 's'} in the last {data.days} days
                {data.prev_active_users ? ` (prev. ${data.prev_active_users})` : ''}.
              </>
            ) : null}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#6B7280' }} title="Refreshes every minute while this page is open">
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: error ? '#B7791F' : '#2C8632', marginRight: 6 }} />
            {loadedAt ? `Updated ${timeAgo(loadedAt, now)}` : 'Loading…'}
          </span>
          <div style={{ display: 'inline-flex', background: '#F1F5F9', borderRadius: 10, padding: 3 }}>
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setDays(r);
                  setSelected(null);
                }}
                style={{
                  border: 0,
                  cursor: 'pointer',
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 13,
                  background: days === r ? '#1D7C7A' : 'transparent',
                  color: days === r ? 'white' : '#0F2A3A',
                }}
              >
                {r}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? <p style={{ fontSize: 12, color: '#B7791F', margin: '0 0 8px' }}>{error}</p> : null}

      {!data ? (
        <p className="admin-subtitle--sm">Loading feature usage…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginTop: 6 }}>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 54px 54px 58px', gap: 8, fontSize: 11, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', padding: '0 4px 6px' }}>
              <span>Feature</span>
              <span style={{ textAlign: 'right' }}>Uses</span>
              <span style={{ textAlign: 'right' }}>Users</span>
              <span style={{ textAlign: 'right' }}>vs prev</span>
            </div>
            {features.map((f) => {
              const active = trendKeys.includes(f.key);
              const colorIdx = trendKeys.indexOf(f.key);
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => toggle(f.key)}
                  title="Click to show or hide on the trend chart"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 54px 54px 58px',
                    gap: 8,
                    alignItems: 'center',
                    width: '100%',
                    border: 0,
                    background: active ? '#F4FAF9' : 'transparent',
                    borderRadius: 10,
                    padding: '7px 4px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    opacity: f.uses === 0 ? 0.55 : 1,
                  }}
                >
                  <span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#0F2A3A' }}>
                      {active ? (
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: SERIES_COLORS[colorIdx % SERIES_COLORS.length] }} />
                      ) : null}
                      {f.label}
                    </span>
                    <span style={{ display: 'block', height: 6, borderRadius: 3, background: '#EEF0EA', marginTop: 5, overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${(f.uses / maxUses) * 100}%`, background: '#1D7C7A', borderRadius: 3, transition: 'width .4s' }} />
                    </span>
                  </span>
                  <span style={{ textAlign: 'right', fontWeight: 900, color: '#0F2A3A' }}>{f.uses}</span>
                  <span style={{ textAlign: 'right', color: '#4B5563' }}>{f.users}</span>
                  <span style={{ textAlign: 'right' }}>
                    <Change pct={f.change_pct} prevUses={f.prev_uses} />
                  </span>
                </button>
              );
            })}
          </div>

          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#0F2A3A', margin: '0 0 6px' }}>Daily trend</p>
            {trendKeys.length ? (
              <>
                <TrendChart dates={data.dates} series={data.series} keys={trendKeys} labels={labels} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
                  {trendKeys.map((k, i) => (
                    <span key={k} style={{ fontSize: 12, color: '#374151', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 10, height: 3, borderRadius: 2, background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                      {labels[k]}
                    </span>
                  ))}
                </div>
                <p style={{ fontSize: 11.5, color: '#9CA3AF', marginTop: 6 }}>
                  Click features in the list to compare them here. Days are in UTC.
                </p>
              </>
            ) : (
              <p className="admin-subtitle--sm">No feature usage in this period yet.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
