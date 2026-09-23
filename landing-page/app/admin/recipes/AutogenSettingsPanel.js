'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const CUISINE_LABELS = {
  west_african: 'West African',
  east_african: 'East African',
  mena: 'Middle Eastern / North African',
  british_irish: 'British / Irish',
  american_canadian: 'American / Canadian',
  caribbean: 'Caribbean',
  mediterranean: 'Mediterranean',
  south_asian: 'South Asian',
  east_asian: 'East Asian',
  southeast_asian: 'Southeast Asian',
  latin_american: 'Latin American',
  european: 'European',
};

export default function AutogenSettingsPanel({ token }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [availableCuisines, setAvailableCuisines] = useState([]);
  const [enabled, setEnabled] = useState(true);
  const [perMealType, setPerMealType] = useState(2);
  const [selectedCuisines, setSelectedCuisines] = useState(() => new Set());

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${API_URL}/api/admin/settings/recipe-autogen`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        setEnabled(Boolean(data.enabled));
        setPerMealType(Number(data.per_meal_type) || 0);
        setSelectedCuisines(new Set(Array.isArray(data.cuisines) ? data.cuisines : []));
        setAvailableCuisines(Array.isArray(data.available_cuisines) ? data.available_cuisines : []);
      } catch {
        // Leave defaults - the panel just won't reflect saved state until reload works.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const toggleCuisine = (cuisine) => {
    setSelectedCuisines((current) => {
      const next = new Set(current);
      if (next.has(cuisine)) next.delete(cuisine);
      else next.add(cuisine);
      return next;
    });
  };

  const selectAllCuisines = () => setSelectedCuisines(new Set(availableCuisines));
  const clearAllCuisines = () => setSelectedCuisines(new Set());

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/settings/recipe-autogen`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          per_meal_type: perMealType,
          cuisines: Array.from(selectedCuisines),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || 'Failed to save settings.');
      setEnabled(Boolean(data.enabled));
      setPerMealType(Number(data.per_meal_type) || 0);
      setSelectedCuisines(new Set(Array.isArray(data.cuisines) ? data.cuisines : []));
      setMessage('Saved.');
    } catch (error) {
      setMessage(error.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const dailyTotal = perMealType * 4;

  return (
    <div className="admin-card" style={{ marginTop: 0, marginBottom: 18 }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          textAlign: 'left',
        }}
      >
        <div>
          <h3 className="admin-title admin-title--sm">AI Auto-Generation</h3>
          <p className="admin-subtitle admin-subtitle--sm">
            {loading
              ? 'Loading...'
              : enabled
                ? `Running daily - ${dailyTotal} draft recipe${dailyTotal === 1 ? '' : 's'}/day across ${selectedCuisines.size} cuisine${selectedCuisines.size === 1 ? '' : 's'}.`
                : 'Paused - no drafts are being generated.'}
          </p>
        </div>
        <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>

      {expanded ? (
        loading ? (
          <p className="admin-loading" style={{ marginTop: 12 }}>
            Loading...
          </p>
        ) : (
          <div style={{ marginTop: 14 }}>
            <p className="admin-subtitle" style={{ fontSize: 13 }}>
              Generates draft recipes automatically once a day (no images, not published) so there's
              always fresh raw material to review. Adjust how many, and which cuisines it draws from.
            </p>

            <label className="admin-inline-toggle" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                disabled={saving}
              />
              <span>Enabled</span>
            </label>

            <div className="admin-field" style={{ marginTop: 12, maxWidth: 220 }}>
              <label>Recipes per meal type (breakfast/lunch/dinner/snack)</label>
              <input
                type="number"
                min={0}
                max={10}
                value={perMealType}
                onChange={(event) => setPerMealType(Math.max(0, Math.min(10, Number(event.target.value) || 0)))}
                disabled={saving}
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <label style={{ fontWeight: 600 }}>Cuisines to rotate through</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="admin-link" onClick={selectAllCuisines} disabled={saving}>
                    Select all
                  </button>
                  <button type="button" className="admin-link" onClick={clearAllCuisines} disabled={saving}>
                    Clear
                  </button>
                </div>
              </div>
              <p className="admin-subtitle" style={{ fontSize: 12, marginTop: 2 }}>
                One cuisine is featured per day, cycling through whichever are checked. Unchecking a
                cuisine keeps it out of auto-generation entirely.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: 8,
                  marginTop: 8,
                }}
              >
                {availableCuisines.map((cuisine) => (
                  <label key={cuisine} className="admin-inline-toggle">
                    <input
                      type="checkbox"
                      checked={selectedCuisines.has(cuisine)}
                      onChange={() => toggleCuisine(cuisine)}
                      disabled={saving}
                    />
                    <span>{CUISINE_LABELS[cuisine] || cuisine}</span>
                  </label>
                ))}
              </div>
              {selectedCuisines.size === 0 ? (
                <p className="admin-message admin-message-error" style={{ marginTop: 8 }}>
                  No cuisines selected - saving with none checked falls back to rotating through all of
                  them, rather than generating nothing.
                </p>
              ) : null}
            </div>

            {message ? <p className="admin-subtitle" style={{ marginTop: 10 }}>{message}</p> : null}

            <div className="admin-actions" style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="admin-button" type="button" onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}
