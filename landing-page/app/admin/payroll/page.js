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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const compsForSelected = compAll
    .filter((c) => String(c.staff_user_id) === String(selectedStaffId))
    .filter((c) => (includeInactive ? true : Boolean(c.is_active)))
    .sort((a, b) => String(b.effective_from || '').localeCompare(String(a.effective_from || '')) || Number(b.id) - Number(a.id));

  const activeComp = compsForSelected.find((c) => Boolean(c.is_active)) || null;

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
    </div>
  );
}
