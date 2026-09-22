'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const PAGE_SIZE = 25;

const TYPE_OPTIONS = [
  'Initial Purchase',
  'Trial Started',
  'Renewal',
  'Trial Converted',
  'Trial Ended',
  'Expired',
  'Cancellation',
  'Uncancellation',
  'Billing Issue',
  'Product Change',
  'Refund',
  'Existing Subscription',
];

const STORE_OPTIONS = [
  { value: 'PLAY_STORE', label: 'Play Store' },
  { value: 'APP_STORE', label: 'App Store' },
  { value: 'STRIPE', label: 'Stripe' },
  { value: 'PROMOTIONAL', label: 'Promotional' },
  { value: 'MAC_APP_STORE', label: 'Mac App Store' },
  { value: 'AMAZON', label: 'Amazon' },
];

const TYPE_TONE = {
  'Initial Purchase': 'success',
  'Trial Started': 'neutral',
  Renewal: 'success',
  'Trial Converted': 'success',
  'Trial Ended': 'danger',
  Expired: 'danger',
  Cancellation: 'warning',
  Uncancellation: 'success',
  'Billing Issue': 'warning',
  Refund: 'danger',
  'Refund Reversed': 'success',
  'Product Change': 'neutral',
};

const toneFor = (type) => TYPE_TONE[type] || 'neutral';

const maskAppUserId = (value) => {
  const str = String(value || '');
  if (str.length <= 8) return str || '--';
  return `${str.slice(0, 4)}••••${str.slice(-4)}`;
};

const relativeTime = (value) => {
  if (!value) return '--';
  const then = new Date(value).getTime();
  const now = Date.now();
  const diffMs = then - now;
  const past = diffMs <= 0;
  const abs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  let amount;
  let unit;
  if (abs < hour) {
    amount = Math.max(1, Math.round(abs / minute));
    unit = 'minute';
  } else if (abs < day) {
    amount = Math.round(abs / hour);
    unit = 'hour';
  } else if (abs < month) {
    amount = Math.round(abs / day);
    unit = 'day';
  } else {
    amount = Math.round(abs / month);
    unit = 'month';
  }
  const plural = amount === 1 ? unit : `${unit}s`;
  return past ? `${amount} ${plural} ago` : `in ${amount} ${plural}`;
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

const formatUsd = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0);

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

export default function AdminTransactionsPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [summary, setSummary] = useState({ all_time: 0, current_year: 0, current_month: 0 });
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadSummary = useCallback(async () => {
    if (!token) return;
    setSummaryLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/revenuecat/transactions/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) return;
      const data = await response.json();
      setSummary({
        all_time: data.all_time || 0,
        current_year: data.current_year || 0,
        current_month: data.current_month || 0,
      });
    } catch {
      // Leave whatever was already loaded.
    } finally {
      setSummaryLoading(false);
    }
  }, [token, router]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(PAGE_SIZE));
    if (typeFilter) params.set('display_type', typeFilter);
    if (storeFilter) params.set('store', storeFilter);
    if (search.trim()) params.set('q', search.trim());
    return params.toString();
  }, [page, typeFilter, storeFilter, search]);

  const load = useCallback(async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setIsLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/revenuecat/transactions?${buildQuery()}`, {
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
    } catch {
      setMessage('Failed to load transactions.');
    } finally {
      setIsLoading(false);
    }
  }, [token, buildQuery, router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="admin-card" style={{ marginBottom: 18 }}>
        <h2 className="admin-title">Transactions</h2>
        <p className="admin-subtitle">Every billing event RevenueCat has reported, across every user.</p>

        <div className="admin-health-grid" style={{ marginTop: 16, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <SummaryCard
            icon="💰"
            label="All-time earning"
            value={summaryLoading ? '--' : formatUsd(summary.all_time)}
            detail="Net revenue across every transaction on record"
          />
          <SummaryCard
            icon="📅"
            label="This year"
            value={summaryLoading ? '--' : formatUsd(summary.current_year)}
            detail={`Revenue booked in ${new Date().getFullYear()}`}
          />
          <SummaryCard
            icon="📈"
            label="This month"
            value={summaryLoading ? '--' : formatUsd(summary.current_month)}
            detail="Revenue booked in the current calendar month"
          />
        </div>
      </div>

      <div className="admin-card">
        {message ? <div className="admin-message admin-message-error">{message}</div> : null}

        <div className="admin-toolbar">
          <input
            className="admin-search-input"
            placeholder="Search app user ID, email, product, transaction..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="admin-sort-select"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All types</option>
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <select
            className="admin-sort-select"
            value={storeFilter}
            onChange={(e) => {
              setStoreFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All stores</option>
            {STORE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <p className="admin-loading">Loading transactions...</p>
        ) : (
          <div className="admin-table-wrap" style={{ marginTop: 14 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>App User ID</th>
                  <th>Store</th>
                  <th>Product</th>
                  <th>Purchased</th>
                  <th>Expires</th>
                  <th>Revenue</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="admin-empty">
                      No transactions found.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <span title={row.app_user_id || ''}>{maskAppUserId(row.app_user_id)}</span>
                        {row.email ? (
                          <div className="admin-subtitle" style={{ fontSize: 12 }}>
                            {row.email}
                          </div>
                        ) : null}
                      </td>
                      <td>{row.store_label || row.store || '--'}</td>
                      <td>{row.product_id || '--'}</td>
                      <td>
                        <span title={row.occurred_at ? new Date(row.occurred_at).toLocaleString() : ''}>
                          {relativeTime(row.occurred_at)}
                        </span>
                      </td>
                      <td>
                        <span title={row.expires_at ? new Date(row.expires_at).toLocaleString() : ''}>
                          {row.expires_at ? relativeTime(row.expires_at) : '--'}
                        </span>
                      </td>
                      <td>{row.price_usd != null ? formatUsd(row.price_usd) : '--'}</td>
                      <td>
                        <span className={`admin-badge admin-badge--${toneFor(row.display_type)}`}>
                          {row.display_type || row.event_type}
                        </span>
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
            Page {page} of {totalPages} ({totalItems} transactions)
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
