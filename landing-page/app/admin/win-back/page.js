'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const PAGE_SIZE = 20;

const RANGE_OPTIONS = [
  { key: 7, label: '7 days' },
  { key: 30, label: '30 days' },
  { key: 90, label: '90 days' },
];

const STAGE_LABEL = {
  day0: 'Day 0 - Premium ended',
  day7: 'Day 7 - Still with us?',
  day14: "Day 14 - What you're missing",
  day21: 'Day 21 - Last check-in',
  monthly: 'Monthly - Still here',
};

const parseErrorResponse = async (response) => {
  try {
    const data = await response.json();
    const detail = data?.detail;
    if (typeof detail === 'string') return detail;
    return data?.message || 'Request failed.';
  } catch {
    return 'Request failed.';
  }
};

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function SummaryCard({ icon, label, value, detail }) {
  return (
    <div className="admin-health-card">
      <div className="admin-health-card-top">
        <div className="admin-health-card-title">
          <span className="admin-health-icon" aria-hidden="true">
            {icon}
          </span>
          <div>
            <p className="admin-health-card-label">{label}</p>
            <p style={{ margin: '4px 0 0', fontSize: 30, fontWeight: 900, color: '#1b3b2f', lineHeight: 1 }}>
              {value}
            </p>
          </div>
        </div>
      </div>
      <p className="admin-health-card-detail">{detail}</p>
    </div>
  );
}

export default function AdminWinBackPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [range, setRange] = useState(7);
  const [summary, setSummary] = useState({ sent: 0, opened: 0, clicked: 0 });
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadSummary = useCallback(async () => {
    if (!token) return;
    setSummaryLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/dunning/summary?days=${range}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) return;
      const data = await response.json();
      setSummary({ sent: data.sent || 0, opened: data.opened || 0, clicked: data.clicked || 0 });
    } catch {
      // Leave whatever was already loaded.
    } finally {
      setSummaryLoading(false);
    }
  }, [token, range, router]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const buildQuery = () => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(PAGE_SIZE));
    if (stage) params.set('stage', stage);
    if (search.trim()) params.set('q', search.trim());
    return params.toString();
  };

  const load = useCallback(async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setIsLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/dunning?${buildQuery()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage(await parseErrorResponse(response));
        setItems([]);
        return;
      }
      const data = await response.json();
      const rows = Array.isArray(data.items) ? data.items : [];
      setItems(rows);
      setTotalItems(data.total || rows.length);
      setTotalPages(Math.max(1, Math.ceil((data.total || rows.length) / PAGE_SIZE)));
    } catch (error) {
      setMessage('Failed to load win-back email history.');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, stage, search, router]);

  useEffect(() => {
    load();
  }, [load]);

  const rangeLabel = RANGE_OPTIONS.find((o) => o.key === range)?.label || `${range} days`;
  const openRate = pct(summary.opened, summary.sent);
  const clickRate = pct(summary.clicked, summary.sent);

  return (
    <div>
      <div className="admin-card" style={{ marginBottom: 18 }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="admin-title">Win-Back Emails</h2>
            <p className="admin-subtitle">
              Every automated dunning/win-back email actually sent - who got it, which stage, and when.
            </p>
          </div>
          <Link className="admin-link" href="/admin/win-back/templates">
            Edit Templates
          </Link>
        </div>

        <div className="admin-tabs" style={{ marginTop: 16, paddingTop: 0, borderTop: 'none' }}>
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`admin-tab ${range === opt.key ? 'is-active' : ''}`}
              onClick={() => setRange(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div
          className="admin-health-grid"
          style={{ marginTop: 16, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
        >
          <SummaryCard
            icon="📨"
            label="Sent"
            value={summaryLoading ? '--' : summary.sent}
            detail={`Win-back emails sent in the last ${rangeLabel}`}
          />
          <SummaryCard
            icon="👀"
            label="Opened"
            value={summaryLoading ? '--' : summary.opened}
            detail={summaryLoading ? 'Loading...' : `${openRate}% open rate`}
          />
          <SummaryCard
            icon="🖱️"
            label="Clicked"
            value={summaryLoading ? '--' : summary.clicked}
            detail={summaryLoading ? 'Loading...' : `${clickRate}% click rate`}
          />
        </div>
      </div>

      <div className="admin-card">
        {message ? <div className="admin-message admin-message-error">{message}</div> : null}

        <div className="admin-toolbar">
          <input
            className="admin-search-input"
            placeholder="Search by user email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="admin-sort-select"
            value={stage}
            onChange={(e) => {
              setStage(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All stages</option>
            <option value="day0">Day 0</option>
            <option value="day7">Day 7</option>
            <option value="day14">Day 14</option>
            <option value="day21">Day 21</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        {isLoading ? (
          <p className="admin-loading">Loading win-back history...</p>
        ) : (
          <div className="admin-table-wrap" style={{ marginTop: 14 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Sent</th>
                  <th>User</th>
                  <th>Stage</th>
                  <th>Subject</th>
                  <th>Opened</th>
                  <th>Clicked</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="admin-empty">
                      No win-back emails sent yet.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id}>
                      <td>{row.sent_at ? new Date(row.sent_at).toLocaleString() : '--'}</td>
                      <td>
                        <div>{row.user_name || '--'}</div>
                        <div className="admin-subtitle" style={{ fontSize: 12 }}>
                          {row.user_email}
                        </div>
                      </td>
                      <td>{STAGE_LABEL[row.stage] || row.stage}</td>
                      <td>{row.subject}</td>
                      <td>
                        {row.opened_at ? (
                          <span title={new Date(row.opened_at).toLocaleString()}>
                            {new Date(row.opened_at).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="admin-subtitle">--</span>
                        )}
                      </td>
                      <td>
                        {row.clicked_at ? (
                          <span title={row.clicked_link || ''}>{new Date(row.clicked_at).toLocaleDateString()}</span>
                        ) : (
                          <span className="admin-subtitle">--</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="admin-pagination" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="admin-pagination-button"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            Prev
          </button>
          <span className="admin-pagination-info">
            Page {page} of {totalPages} ({totalItems} emails)
          </span>
          <button
            type="button"
            className="admin-pagination-button"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
