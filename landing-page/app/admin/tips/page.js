'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const emptyForm = {
  id: '',
  title: '',
  tip: '',
  why: '',
  try_today: '',
  category: 'general',
  active: true,
  audience_profiles: [],
  exclude_profiles: [],
};

const CATEGORY_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'meals', label: 'Meals' },
  { value: 'habits', label: 'Habits' },
  { value: 'movement', label: 'Movement' },
  { value: 'labels', label: 'Labels' },
  { value: 'custom', label: 'Custom…' },
];

const PROFILE_OPTIONS = [
  { value: 'type_2', label: 'Type 2 diabetes' },
  { value: 'prediabetes', label: 'Prediabetes' },
  { value: 'type_1', label: 'Type 1 diabetes' },
  { value: 'gestational', label: 'Gestational diabetes' },
  { value: 'managing', label: 'Managing blood sugar' },
  { value: 'prefer_not', label: 'Prefer not to say' },
];

const toggleInList = (list, value) => {
  const next = Array.isArray(list) ? list.slice() : [];
  const index = next.indexOf(value);
  if (index >= 0) {
    next.splice(index, 1);
    return next;
  }
  next.push(value);
  return next;
};

const parseJsonSafe = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export default function AdminTipsPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [tips, setTips] = useState([]);
  const [blockedTipIds, setBlockedTipIds] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [search, setSearch] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [customCategory, setCustomCategory] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    if (!token) {
      router.push('/admin');
      return;
    }
    void loadAll();
  }, [token]);

  const loadAll = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [tipsRes, settingsRes, summaryRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/tips`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/admin/settings/tips`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/admin/tips/feedback-summary?days=7`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if ([tipsRes, settingsRes, summaryRes].some((r) => r.status === 401)) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }

      const tipsData = await tipsRes.json();
      const settingsData = await settingsRes.json();
      const summaryData = await summaryRes.json();

      setTips(Array.isArray(tipsData.items) ? tipsData.items : []);
      setBlockedTipIds(Array.isArray(settingsData.blocked_tip_ids) ? settingsData.blocked_tip_ids : []);
      setSummary(summaryData && typeof summaryData === 'object' ? summaryData : null);
    } catch {
      setMessage('Failed to load tips.');
    } finally {
      setLoading(false);
    }
  };

  const filtered = tips.filter((t) => {
    if (!search.trim()) return true;
    const s = search.trim().toLowerCase();
    return (
      String(t?.title || '').toLowerCase().includes(s) ||
      String(t?.id || '').toLowerCase().includes(s) ||
      String(t?.category || '').toLowerCase().includes(s)
    );
  });

  useEffect(() => {
    setPage(1);
  }, [search, pageSize, tips.length]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pageItems = filtered.slice(startIndex, startIndex + pageSize);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setCustomCategory('');
    setShowEditor(true);
  };

  const openEdit = (tip) => {
    setEditingId(tip?.id || null);
    const categoryValue = String(tip?.category || 'general').trim() || 'general';
    const knownCategory = CATEGORY_OPTIONS.some((x) => x.value === categoryValue);
    const mappedCategory = knownCategory ? categoryValue : 'custom';
    setForm({
      id: tip?.id || '',
      title: tip?.title || '',
      tip: tip?.tip || '',
      why: tip?.why || '',
      try_today: tip?.try_today || '',
      category: mappedCategory,
      active: tip?.active !== false,
      audience_profiles: Array.isArray(tip?.audience_profiles) ? tip.audience_profiles : [],
      exclude_profiles: Array.isArray(tip?.exclude_profiles) ? tip.exclude_profiles : [],
    });
    setCustomCategory(mappedCategory === 'custom' ? categoryValue : '');
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditingId(null);
    setForm(emptyForm);
    setCustomCategory('');
  };

  const saveTip = async () => {
    setSaving(true);
    setMessage('');
    try {
      const finalCategory =
        form.category === 'custom'
          ? String(customCategory || '').trim() || 'general'
          : String(form.category || '').trim() || 'general';
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `${API_URL}/api/admin/tips/${encodeURIComponent(editingId)}` : `${API_URL}/api/admin/tips`;
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: form.id || undefined,
          title: form.title,
          tip: form.tip,
          why: form.why,
          try_today: form.try_today,
          category: finalCategory,
          active: Boolean(form.active),
          audience_profiles: Array.isArray(form.audience_profiles) ? form.audience_profiles : [],
          exclude_profiles: Array.isArray(form.exclude_profiles) ? form.exclude_profiles : [],
        }),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        const data = parseJsonSafe(await response.text());
        throw new Error(data?.detail || 'Save failed');
      }
      await loadAll();
      closeEditor();
    } catch (error) {
      setMessage(error?.message || 'Failed to save tip.');
    } finally {
      setSaving(false);
    }
  };

  const seedTips = async () => {
    if (!confirm('Seed / update the default curated tips into the catalog?')) return;
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/tips/seed?mode=upsert`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) throw new Error();
      const seeded = parseJsonSafe(await response.text());
      await loadAll();
      if (seeded && typeof seeded === 'object') {
        const added = seeded.added ?? '?';
        const updated = seeded.updated ?? '?';
        const total = seeded.total ?? '?';
        const seedCount = seeded.seed_default_count ?? '?';
        setMessage(`Seeded tips: +${added} / updated ${updated} (total ${total}). Default seed count=${seedCount}.`);
      } else {
        setMessage('Seeded tips successfully.');
      }
      setTimeout(() => setMessage(''), 2500);
    } catch {
      setMessage('Failed to seed tips.');
    }
  };

  const deleteTip = async (id) => {
    if (!confirm('Delete this tip?')) return;
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/tips/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) throw new Error();
      await loadAll();
    } catch {
      setMessage('Failed to delete tip.');
    }
  };

  const saveBlocked = async (nextBlocked) => {
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/settings/tips`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ blocked_tip_ids: nextBlocked }),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) throw new Error();
      setBlockedTipIds(nextBlocked);
      setMessage('Saved tip blocklist.');
      setTimeout(() => setMessage(''), 2500);
    } catch {
      setMessage('Failed to save blocklist.');
    }
  };

  const toggleBlocked = async (tipId) => {
    const exists = blockedTipIds.includes(tipId);
    const next = exists ? blockedTipIds.filter((x) => x !== tipId) : [...blockedTipIds, tipId];
    await saveBlocked(next);
  };

  const topDisliked = Array.isArray(summary?.items)
    ? summary.items.filter((x) => (x?.not_useful || 0) > 0).slice(0, 8)
    : [];

  const formatReasons = (reasons) => {
    if (!reasons || typeof reasons !== 'object') return '';
    const entries = Object.entries(reasons)
      .filter(([, count]) => Number(count) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 3);
    if (entries.length === 0) return '';
    return entries.map(([reason, count]) => `${reason} (${count})`).join(', ');
  };

  return (
    <div className="admin-card">
      <div className="admin-recipes-header">
        <h2 className="admin-title">Daily Tips</h2>
        <p className="admin-subtitle">Manage curated tips and review user feedback.</p>
      </div>

      {message && <div className="admin-message">{message}</div>}

      {loading ? (
        <div className="admin-loading-state">
          <p>Loading tips...</p>
        </div>
      ) : (
        <>
          <div className="admin-recipes-toolbar" style={{ marginTop: 0 }}>
            <div className="admin-toolbar-grid">
              <div className="admin-toolbar-search">
                <input
                  type="text"
                  placeholder="Search tips (title / id / category)..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="admin-search-input"
                />
              </div>
              <div className="admin-toolbar-actions">
                <button className="admin-button admin-add-button" type="button" onClick={openCreate}>
                  Add Tip
                </button>
                <button className="admin-button secondary" type="button" onClick={() => void seedTips()}>
                  Seed tips
                </button>
              </div>
            </div>
          </div>

          <div className="admin-inline" style={{ marginTop: 12 }}>
            <div className="admin-subcard">
              <span>Total tips</span>
              <strong>{tips.length}</strong>
            </div>
            <div className="admin-subcard">
              <span>Blocked</span>
              <strong>{blockedTipIds.length}</strong>
            </div>
            <div className="admin-subcard">
              <span>Dislikes (7d)</span>
              <strong>{summary?.totals?.not_useful || 0}</strong>
            </div>
          </div>

          {topDisliked.length > 0 && (
            <div className="admin-card" style={{ marginTop: 14 }}>
              <h3 className="admin-title" style={{ fontSize: 16, marginBottom: 6 }}>
                Most disliked (last 7 days)
              </h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Tip</th>
                      <th>Dislikes</th>
                      <th>Total</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDisliked.map((row) => (
                      <tr key={row.tip_id}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{row.title || row.tip_id}</div>
                          <div className="muted">{row.tip_id}</div>
                          {formatReasons(row.reasons) ? (
                            <div className="muted" style={{ marginTop: 6 }}>
                              Reasons: {formatReasons(row.reasons)}
                            </div>
                          ) : null}
                        </td>
                        <td>{row.not_useful}</td>
                        <td>{row.total}</td>
                        <td>
                          <button
                            className="admin-button secondary"
                            type="button"
                            onClick={() => void toggleBlocked(row.tip_id)}
                          >
                            {blockedTipIds.includes(row.tip_id) ? 'Unblock' : 'Block'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="admin-table-wrap" style={{ marginTop: 14 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: '18%' }}>ID</th>
                  <th>Title</th>
                  <th style={{ width: '12%' }}>Category</th>
                  <th style={{ width: '10%' }}>Active</th>
                  <th style={{ width: '14%' }}>Blocked</th>
                  <th style={{ width: '18%' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      No tips found.
                    </td>
                  </tr>
                ) : (
                  pageItems.map((t) => (
                    <tr key={t.id}>
                      <td className="muted">{t.id}</td>
                      <td>
                        <div style={{ fontWeight: 800 }}>{t.title}</div>
                        <div className="muted" style={{ marginTop: 4 }}>
                          {t.tip}
                        </div>
                      </td>
                      <td className="muted">{t.category || 'general'}</td>
                      <td>{t.active === false ? 'No' : 'Yes'}</td>
                      <td>
                        <button
                          className="admin-button secondary"
                          type="button"
                          onClick={() => void toggleBlocked(t.id)}
                        >
                          {blockedTipIds.includes(t.id) ? 'Unblock' : 'Block'}
                        </button>
                      </td>
                      <td>
                        <div className="admin-inline" style={{ margin: 0 }}>
                          <button className="admin-button secondary" type="button" onClick={() => openEdit(t)}>
                            Edit
                          </button>
                          <button className="admin-button danger" type="button" onClick={() => void deleteTip(t.id)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="admin-pagination" style={{ justifyContent: 'space-between', flexWrap: 'wrap', width: '100%' }}>
              <div className="admin-pagination-left">
                <span className="muted">
                  Showing {startIndex + 1}–{Math.min(startIndex + pageSize, filtered.length)} of {filtered.length}
                </span>
              </div>
              <div className="admin-pagination-right">
                <select
                  className="admin-select"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value) || 20)}
                  aria-label="Page size"
                >
                  <option value={10}>10 / page</option>
                  <option value={20}>20 / page</option>
                  <option value={50}>50 / page</option>
                </select>
                <button
                  className="admin-button secondary"
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  Prev
                </button>
                <span className="muted" style={{ minWidth: 92, textAlign: 'center' }}>
                  Page {safePage} / {totalPages}
                </span>
                <button
                  className="admin-button secondary"
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {showEditor && (
            <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
              <div className="admin-modal">
                <div className="admin-modal-header">
                  <h3>{editingId ? 'Edit tip' : 'Add tip'}</h3>
                  <button className="admin-icon-button danger" type="button" onClick={closeEditor} aria-label="Close">
                    ×
                  </button>
                </div>
                <div className="admin-modal-body">
                  <div className="admin-form-grid">
                    <label className="admin-form-field">
                      <span>ID (optional)</span>
                      <input
                        value={form.id}
                        onChange={(e) => setForm({ ...form, id: e.target.value })}
                        placeholder="auto-generated if empty"
                      />
                    </label>
                    <label className="admin-form-field">
                      <span>Category</span>
                      <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                        {CATEGORY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {form.category === 'custom' && (
                      <label className="admin-form-field">
                        <span>Custom category</span>
                        <input
                          value={customCategory}
                          onChange={(e) => setCustomCategory(e.target.value)}
                          placeholder="e.g. sleep"
                        />
                      </label>
                    )}
                    <label className="admin-form-field" style={{ gridColumn: '1 / -1' }}>
                      <span>Title</span>
                      <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                    </label>
                    <label className="admin-form-field" style={{ gridColumn: '1 / -1' }}>
                      <span>Tip</span>
                      <textarea
                        rows={2}
                        value={form.tip}
                        onChange={(e) => setForm({ ...form, tip: e.target.value })}
                      />
                    </label>
                    <label className="admin-form-field" style={{ gridColumn: '1 / -1' }}>
                      <span>Why it helps</span>
                      <textarea
                        rows={2}
                        value={form.why}
                        onChange={(e) => setForm({ ...form, why: e.target.value })}
                      />
                    </label>
                    <label className="admin-form-field" style={{ gridColumn: '1 / -1' }}>
                      <span>Try this today</span>
                      <textarea
                        rows={2}
                        value={form.try_today}
                        onChange={(e) => setForm({ ...form, try_today: e.target.value })}
                      />
                    </label>

                    <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>Targeting (optional)</div>
                      <div className="muted" style={{ marginBottom: 10 }}>
                        If you select an audience, only those users will see this tip (others fall back to general tips).
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        {PROFILE_OPTIONS.map((opt) => (
                          <label key={`aud-${opt.value}`} className="admin-inline-toggle" style={{ gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={Array.isArray(form.audience_profiles) && form.audience_profiles.includes(opt.value)}
                              onChange={() =>
                                setForm((s) => ({
                                  ...s,
                                  audience_profiles: toggleInList(s.audience_profiles, opt.value),
                                }))
                              }
                              disabled={saving}
                            />
                            <span>Audience: {opt.label}</span>
                          </label>
                        ))}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                        {PROFILE_OPTIONS.map((opt) => (
                          <label key={`ex-${opt.value}`} className="admin-inline-toggle" style={{ gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={Array.isArray(form.exclude_profiles) && form.exclude_profiles.includes(opt.value)}
                              onChange={() =>
                                setForm((s) => ({
                                  ...s,
                                  exclude_profiles: toggleInList(s.exclude_profiles, opt.value),
                                }))
                              }
                              disabled={saving}
                            />
                            <span>Exclude: {opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <label className="admin-form-field">
                      <span>Active</span>
                      <select
                        value={form.active ? 'yes' : 'no'}
                        onChange={(e) => setForm({ ...form, active: e.target.value === 'yes' })}
                      >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </label>
                  </div>
                </div>
                <div className="admin-modal-footer">
                  <button className="admin-button secondary" type="button" onClick={closeEditor} disabled={saving}>
                    Cancel
                  </button>
                  <button className="admin-button admin-add-button" type="button" onClick={() => void saveTip()} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
