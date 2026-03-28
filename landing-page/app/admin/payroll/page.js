'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';

export default function PayrollPage() {
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [staffUsers, setStaffUsers] = useState([]);
  const [compAll, setCompAll] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [runItems, setRunItems] = useState([]);
  const [runLoading, setRunLoading] = useState(false);
  const [creatingRun, setCreatingRun] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const now = useMemo(() => new Date(), []);
  const [runYear, setRunYear] = useState(now.getFullYear());
  const [runMonth, setRunMonth] = useState(now.getMonth() + 1);
  const [overwriteGenerate, setOverwriteGenerate] = useState(false);

  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [includeInactive, setIncludeInactive] = useState(true);

  const [currency, setCurrency] = useState('GBP');
  const [gross, setGross] = useState('');
  const [deductionsDefault, setDeductionsDefault] = useState('0');
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [staffRes, compRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/staff/users?include_deleted=0`, { headers }),
        fetch(`${API_URL}/api/admin/payroll/compensation?include_inactive=1`, { headers }),
      ]);

      if (staffRes.status === 401 || compRes.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }

      const staffData = await staffRes.json().catch(() => ({}));
      const compData = await compRes.json().catch(() => ({}));

      if (!staffRes.ok) throw new Error(staffData.detail || 'Failed to load staff users.');
      if (!compRes.ok) throw new Error(compData.detail || 'Failed to load compensation.');

      const staffItems = Array.isArray(staffData.items) ? staffData.items : [];
      setStaffUsers(staffItems);

      const compItems = Array.isArray(compData.items) ? compData.items : [];
      setCompAll(compItems);

      if (!selectedStaffId && staffItems[0]?.id) setSelectedStaffId(String(staffItems[0].id));
    } catch (e) {
      setMessage(e?.message || 'Failed to load payroll data.');
    } finally {
      setLoading(false);
    }
  };

  const loadRuns = async () => {
    if (!token) return;
    setRunLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/payroll/runs`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load runs.');
      const items = Array.isArray(data.items) ? data.items : [];
      setRuns(items);
      if (!selectedRunId && items[0]?.id) setSelectedRunId(String(items[0].id));
    } catch (e) {
      setMessage(e?.message || 'Failed to load runs.');
    } finally {
      setRunLoading(false);
    }
  };

  const loadRunItems = async (runId) => {
    if (!token || !runId) return;
    setRunLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/payroll/runs/${runId}/items`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load items.');
      setRunItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setMessage(e?.message || 'Failed to load items.');
      setRunItems([]);
    } finally {
      setRunLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedRunId) return;
    loadRunItems(selectedRunId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRunId]);

  const compsForSelected = compAll
    .filter((c) => String(c.staff_user_id) === String(selectedStaffId))
    .filter((c) => (includeInactive ? true : Boolean(c.is_active)))
    .sort((a, b) => String(b.effective_from || '').localeCompare(String(a.effective_from || '')) || Number(b.id) - Number(a.id));

  const activeComp = compsForSelected.find((c) => Boolean(c.is_active)) || null;

  const selectedRun = runs.find((r) => String(r.id) === String(selectedRunId)) || null;
  const runIsDraft = !selectedRun || String(selectedRun.status || '').toLowerCase() === 'draft';

  useEffect(() => {
    if (!activeComp) return;
    setCurrency(String(activeComp.currency || 'GBP'));
    setGross(String(activeComp.monthly_gross ?? ''));
    setDeductionsDefault(String(activeComp.monthly_deductions_default ?? '0'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStaffId, activeComp?.id]);

  const saveComp = async () => {
    if (!token) return;
    if (!selectedStaffId) {
      setMessage('Select a staff user.');
      return;
    }
    if (!gross || Number(gross) < 0) {
      setMessage('Enter a valid gross amount.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/payroll/compensation`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_user_id: Number(selectedStaffId),
          currency,
          monthly_gross: gross,
          monthly_deductions_default: deductionsDefault || 0,
          effective_from: effectiveFrom,
        }),
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to save compensation.');
      await load();
    } catch (e) {
      setMessage(e?.message || 'Failed to save compensation.');
    } finally {
      setSaving(false);
    }
  };

  const disableComp = async (id) => {
    if (!token) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/payroll/compensation/${id}/disable`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to disable.');
      await load();
    } catch (e) {
      setMessage(e?.message || 'Failed to disable.');
    }
  };

  const createRun = async () => {
    if (!token) return;
    setCreatingRun(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/payroll/runs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: Number(runYear), month: Number(runMonth) }),
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to create run.');
      await loadRuns();
      if (data.id) setSelectedRunId(String(data.id));
    } catch (e) {
      setMessage(e?.message || 'Failed to create run.');
    } finally {
      setCreatingRun(false);
    }
  };

  const generateRunItems = async () => {
    if (!token || !selectedRunId) return;
    setGenerating(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/payroll/runs/${selectedRunId}/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ overwrite: Boolean(overwriteGenerate) }),
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to generate items.');
      if (Array.isArray(data.missing_staff_user_ids) && data.missing_staff_user_ids.length > 0) {
        setMessage(`Generated, but missing compensation for staff IDs: ${data.missing_staff_user_ids.join(', ')}`);
      }
      await loadRunItems(selectedRunId);
    } catch (e) {
      setMessage(e?.message || 'Failed to generate items.');
    } finally {
      setGenerating(false);
    }
  };

  const finalizeRun = async () => {
    if (!token || !selectedRunId) return;
    setFinalizing(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/payroll/runs/${selectedRunId}/finalize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to finalize run.');
      await loadRuns();
    } catch (e) {
      setMessage(e?.message || 'Failed to finalize run.');
    } finally {
      setFinalizing(false);
    }
  };

  const updateRunItem = async (item) => {
    if (!token || !item?.id) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/payroll/items/${item.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ gross: item.gross, deductions: item.deductions, notes: item.notes || '' }),
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to update item.');
      await loadRunItems(selectedRunId);
    } catch (e) {
      setMessage(e?.message || 'Failed to update item.');
    }
  };

  return (
    <div className="admin-card">
      <h2 className="admin-title">Payroll</h2>
      <p className="admin-subtitle">HR/Admin only. Set staff compensation used to auto-generate payroll runs.</p>

      {message ? <div className="admin-alert warning">{message}</div> : null}

      {loading ? (
        <LoadingState label="Loading compensation…" />
      ) : staffUsers.length === 0 ? (
        <EmptyState title="No staff users" body="Create staff users first, then set compensation here." />
      ) : (
        <div className="admin-grid" style={{ marginTop: 14, alignItems: 'start' }}>
          <div className="admin-card admin-card--subtle admin-card--compact">
            <h3 style={{ marginTop: 0 }}>Staff</h3>
            <div className="admin-field">
              <label>Select staff member</label>
              <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)}>
                {staffUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email} ({u.timezone})
                  </option>
                ))}
              </select>
            </div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
              <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
              Show history (inactive)
            </label>
            <div className="admin-actions" style={{ marginTop: 12 }}>
              <button className="admin-button secondary" type="button" onClick={load} disabled={loading}>
                Refresh
              </button>
            </div>
          </div>

          <div className="admin-card admin-card--subtle admin-card--compact">
            <h3 style={{ marginTop: 0 }}>Set compensation</h3>
            <p className="admin-help" style={{ marginBottom: 12 }}>
              Saving creates a new active compensation record and disables the previous active record (history is retained).
            </p>

            <div className="admin-field">
              <label>Currency</label>
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="GBP" />
            </div>
            <div className="admin-field">
              <label>Monthly gross</label>
              <input value={gross} onChange={(e) => setGross(e.target.value)} placeholder="e.g. 1500" />
            </div>
            <div className="admin-field">
              <label>Default deductions</label>
              <input value={deductionsDefault} onChange={(e) => setDeductionsDefault(e.target.value)} placeholder="0" />
            </div>
            <div className="admin-field">
              <label>Effective from</label>
              <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>

            <div className="admin-actions">
              <button className="admin-button" type="button" onClick={saveComp} disabled={saving || !selectedStaffId}>
                {saving ? 'Saving…' : 'Save compensation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && staffUsers.length > 0 ? (
        <div className="admin-card" style={{ marginTop: 16 }}>
          <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Compensation history</h3>
            <p className="admin-subtitle" style={{ margin: 0 }}>
              {compsForSelected.length} record(s)
            </p>
          </div>

          {compsForSelected.length === 0 ? (
            <EmptyState title="No compensation records" body="Set a compensation record for this staff member." />
          ) : (
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Effective</th>
                    <th>Currency</th>
                    <th>Gross</th>
                    <th>Deductions</th>
                    <th>Net</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {compsForSelected.map((c) => {
                    const grossV = Number(c.monthly_gross || 0);
                    const dedV = Number(c.monthly_deductions_default || 0);
                    const netV = Math.max(0, grossV - dedV);
                    return (
                      <tr key={c.id} style={!c.is_active ? { opacity: 0.7 } : undefined}>
                        <td>
                          <span className={`admin-badge ${c.is_active ? 'success' : 'secondary'}`}>{c.is_active ? 'Active' : 'Inactive'}</span>
                        </td>
                        <td>{c.effective_from || ''}</td>
                        <td>{c.currency}</td>
                        <td>{c.monthly_gross}</td>
                        <td>{c.monthly_deductions_default}</td>
                        <td>{netV.toFixed(2)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {c.is_active ? (
                            <button className="admin-button secondary" type="button" onClick={() => disableComp(c.id)}>
                              Disable
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      <div className="admin-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Payroll runs</h3>
        <p className="admin-subtitle">
          Create a run for a month/year and auto-generate payroll items from compensation effective as-of that month.
        </p>

        {runLoading ? <LoadingState label="Loading payroll runs…" /> : null}

        <div className="admin-grid" style={{ gridTemplateColumns: '1fr', gap: 16, marginTop: 12 }}>
          <div className="admin-card admin-card--subtle admin-card--compact">
            <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
              <div className="admin-actions" style={{ margin: 0 }}>
                <div className="admin-field" style={{ margin: 0, minWidth: 120 }}>
                  <label>Year</label>
                  <input type="number" value={runYear} onChange={(e) => setRunYear(Number(e.target.value || runYear))} />
                </div>
                <div className="admin-field" style={{ margin: 0, minWidth: 100 }}>
                  <label>Month</label>
                  <input
                    type="number"
                    value={runMonth}
                    min={1}
                    max={12}
                    onChange={(e) => setRunMonth(Number(e.target.value || runMonth))}
                  />
                </div>
                <button className="admin-button" type="button" onClick={createRun} disabled={creatingRun}>
                  {creatingRun ? 'Creating…' : 'Create run'}
                </button>
              </div>
              <button className="admin-button secondary" type="button" onClick={loadRuns} disabled={runLoading}>
                Refresh
              </button>
            </div>

            {runs.length === 0 ? (
              <EmptyState title="No payroll runs yet" body="Create a run to start generating payroll items." />
            ) : (
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Status</th>
                      <th>Finalized</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id} style={String(r.id) === String(selectedRunId) ? { background: 'rgba(46,125,50,0.06)' } : undefined}>
                        <td>
                          {r.year}-{String(r.month).padStart(2, '0')}
                        </td>
                        <td>
                          <span className={`admin-badge ${r.status === 'finalized' ? 'success' : 'secondary'}`}>{r.status}</span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.finalized_at ? new Date(r.finalized_at).toLocaleString() : ''}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="admin-button secondary" type="button" onClick={() => setSelectedRunId(String(r.id))}>
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="admin-card admin-card--subtle admin-card--compact">
            <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: 0 }}>Run items</h4>
                <p className="admin-help" style={{ marginTop: 6 }}>
                  Edit gross/deductions/notes before finalizing.
                </p>
              </div>
              <div className="admin-actions" style={{ margin: 0 }}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="checkbox" checked={overwriteGenerate} onChange={(e) => setOverwriteGenerate(e.target.checked)} />
                  Overwrite
                </label>
                <button className="admin-button secondary" type="button" onClick={generateRunItems} disabled={!selectedRunId || generating}>
                  {generating ? 'Generating…' : 'Generate items'}
                </button>
                <button className="admin-button" type="button" onClick={finalizeRun} disabled={!selectedRunId || finalizing || !runIsDraft}>
                  {finalizing ? 'Finalizing…' : 'Finalize'}
                </button>
              </div>
            </div>

            {!selectedRunId ? (
              <EmptyState title="No run selected" body="Pick a payroll run to view and edit items." />
            ) : runItems.length === 0 ? (
              <EmptyState title="No items" body="Click “Generate items” to build payroll items from compensation." />
            ) : (
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Currency</th>
                      <th>Gross</th>
                      <th>Deductions</th>
                      <th>Net</th>
                      <th>Notes</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {runItems.map((it) => (
                      <tr key={it.id} style={!runIsDraft ? { opacity: 0.75 } : undefined}>
                        <td style={{ whiteSpace: 'nowrap' }}>{it.staff_email}</td>
                        <td style={{ width: 84 }}>
                          <input
                            value={it.currency}
                            disabled
                            style={{ width: 72, padding: 8, borderRadius: 10, border: '1px solid #cfe0d8' }}
                          />
                        </td>
                        <td style={{ width: 120 }}>
                          <input
                            value={it.gross}
                            disabled={!runIsDraft}
                            onChange={(e) => {
                              const next = runItems.map((x) => (x.id === it.id ? { ...x, gross: e.target.value } : x));
                              setRunItems(next);
                            }}
                            style={{ width: 110, padding: 8, borderRadius: 10, border: '1px solid #cfe0d8' }}
                          />
                        </td>
                        <td style={{ width: 120 }}>
                          <input
                            value={it.deductions}
                            disabled={!runIsDraft}
                            onChange={(e) => {
                              const next = runItems.map((x) => (x.id === it.id ? { ...x, deductions: e.target.value } : x));
                              setRunItems(next);
                            }}
                            style={{ width: 110, padding: 8, borderRadius: 10, border: '1px solid #cfe0d8' }}
                          />
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{it.net}</td>
                        <td style={{ minWidth: 220 }}>
                          <input
                            value={it.notes || ''}
                            disabled={!runIsDraft}
                            onChange={(e) => {
                              const next = runItems.map((x) => (x.id === it.id ? { ...x, notes: e.target.value } : x));
                              setRunItems(next);
                            }}
                            placeholder="Optional"
                            style={{ width: '100%', padding: 8, borderRadius: 10, border: '1px solid #cfe0d8' }}
                          />
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="admin-button secondary" type="button" onClick={() => updateRunItem(it)} disabled={!runIsDraft}>
                            Save
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
