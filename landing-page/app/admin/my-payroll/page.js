'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';

export default function MyPayrollPage() {
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [items, setItems] = useState([]);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);

  const downloadNameForItem = (it) => {
    const y = String(it?.year || '');
    const m = String(it?.month || '').padStart(2, '0');
    return `payslip_${y}-${m}_${String(it?.id || '')}.pdf`.replace(/[\\\/:*?"<>|]+/g, '_');
  };

  const fetchPayslipPdf = async (it, { download }) => {
    if (!token || !it?.id) return;
    setMessage('');
    setPdfLoadingId(it.id);
    try {
      const url = `${API_URL}/api/admin/payroll/my/items/${encodeURIComponent(String(it.id))}/payslip.pdf?download=${download ? '1' : '0'}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to fetch payslip.');
      }

      const blob = await res.blob();
      const href = window.URL.createObjectURL(blob);

      if (download) {
        const a = document.createElement('a');
        a.href = href;
        a.download = downloadNameForItem(it);
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(href);
      } else {
        window.open(href, '_blank', 'noopener,noreferrer');
        // Revoke later to allow the new tab to load.
        setTimeout(() => {
          try {
            window.URL.revokeObjectURL(href);
          } catch {
            // ignore
          }
        }, 60_000);
      }
    } catch (e) {
      setMessage(e?.message || 'Failed to fetch payslip.');
    } finally {
      setPdfLoadingId(null);
    }
  };

  const load = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/payroll/my/items`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load payroll.');
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setItems([]);
      setMessage(e?.message || 'Failed to load payroll.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const key = `${it.year}-${String(it.month).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    const keys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
    return keys.map((k) => ({ period: k, items: map.get(k) }));
  }, [items]);

  const monthLabel = (period) => {
    const [y, m] = String(period).split('-').map((x) => Number(x));
    const d = new Date(Date.UTC(y, (m || 1) - 1, 1));
    return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  };

  const totalsByCurrency = (rows) => {
    const byCur = new Map();
    for (const r of rows) {
      const cur = String(r.currency || '').toUpperCase() || '—';
      const gross = Number(r.gross || 0) || 0;
      const ded = Number(r.deductions || 0) || 0;
      const net = Number(r.net || 0) || 0;
      if (!byCur.has(cur)) byCur.set(cur, { currency: cur, gross: 0, deductions: 0, net: 0 });
      const t = byCur.get(cur);
      t.gross += gross;
      t.deductions += ded;
      t.net += net;
    }
    return Array.from(byCur.values());
  };

  return (
    <div className="admin-card">
      <h2 className="admin-title">My Payroll</h2>
      <p className="admin-subtitle">View your payslips and monthly payroll history.</p>

      {message ? <div className="admin-alert warning">{message}</div> : null}

      <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="admin-button info" type="button" onClick={load} disabled={loading}>
          Refresh
        </button>
        <p className="admin-subtitle" style={{ margin: 0 }}>
          {items.length} item(s)
        </p>
      </div>

      {loading ? (
        <div style={{ marginTop: 14 }}>
          <LoadingState label="Loading payslips…" />
        </div>
      ) : groups.length === 0 ? (
        <div style={{ marginTop: 14 }}>
          <EmptyState title="No payslips yet" body="Once HR generates a payroll run, your payslips will show up here." />
        </div>
      ) : (
        <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
          {groups.map((g) => {
            const totals = totalsByCurrency(g.items);
            const status = String(g.items?.[0]?.run_status || '').toLowerCase();
            const badge = status === 'finalized' ? 'success' : 'secondary';
            return (
              <div key={g.period} className="admin-card admin-card--subtle admin-card--compact">
                <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{monthLabel(g.period)}</h3>
                    <p className="admin-help" style={{ marginTop: 6 }}>
                      Status: <span className={`admin-badge ${badge}`}>{status || 'draft'}</span>
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {totals.map((t) => (
                      <div key={t.currency} style={{ fontWeight: 700 }}>
                        {t.currency} Net: {t.net.toFixed(2)}
                      </div>
                    ))}
                    {totals.map((t) => (
                      <div key={`${t.currency}-sub`} className="admin-help">
                        {t.currency} Gross {t.gross.toFixed(2)} · Deductions {t.deductions.toFixed(2)}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ overflowX: 'auto', marginTop: 12 }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Currency</th>
                        <th>Gross</th>
                        <th>Deductions</th>
                        <th>Net</th>
                        <th style={{ width: 200 }}>Payslip</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((it) => (
                        <tr key={it.id}>
                          <td>{it.currency}</td>
                          <td>{it.gross}</td>
                          <td>{it.deductions}</td>
                          <td style={{ fontWeight: 700 }}>{it.net}</td>
                          <td>
                            <div className="admin-inline" style={{ gap: 10 }}>
                              <button
                                className="admin-button neutral"
                                type="button"
                                onClick={() => fetchPayslipPdf(it, { download: false })}
                                disabled={pdfLoadingId === it.id}
                              >
                                {pdfLoadingId === it.id ? 'Loading…' : 'View PDF'}
                              </button>
                              <button
                                className="admin-button info"
                                type="button"
                                onClick={() => fetchPayslipPdf(it, { download: true })}
                                disabled={pdfLoadingId === it.id}
                              >
                                Download
                              </button>
                            </div>
                          </td>
                          <td style={{ maxWidth: 520, whiteSpace: 'pre-wrap' }}>{it.notes || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
