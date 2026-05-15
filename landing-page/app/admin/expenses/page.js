'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'GBP', label: 'GBP' },
  { value: 'NGN', label: 'NGN' },
];

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const CATEGORY_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'salary', label: 'Salary' },
  { value: 'software', label: 'Software' },
  { value: 'hosting', label: 'Hosting & infrastructure' },
  { value: 'ai_services', label: 'AI services' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'office', label: 'Office' },
  { value: 'travel', label: 'Travel' },
  { value: 'meals', label: 'Meals' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'contractors', label: 'Contractors' },
  { value: 'taxes', label: 'Taxes' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'refunds', label: 'Refunds' },
  { value: 'domain', label: 'Domain' },
  { value: 'app_store', label: 'App Store' },
  { value: 'other', label: 'Other' },
];

const CHART_COLORS = ['#1D9E75', '#1976D2', '#BA7517', '#7C3AED', '#DB2777', '#0F766E', '#EA580C', '#475569'];
const PAGE_SIZE = 10;

const categoryLabel = (value) => CATEGORY_OPTIONS.find((option) => option.value === value)?.label || value || 'General';
const monthLabel = (value) => MONTH_OPTIONS.find((option) => option.value === Number(value))?.label || 'Month';
const money = (value) => `GBP ${Number(value || 0).toFixed(2)}`;
const gbpAmount = (item) => {
  if (item.amount_gbp !== null && item.amount_gbp !== undefined) return Number(item.amount_gbp);
  if (item.currency === 'GBP') return Number(item.amount);
  return null;
};

export default function ExpensesPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState('');
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [page, setPage] = useState(1);

  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('GBP');
  const [category, setCategory] = useState('general');
  const [note, setNote] = useState('');

  const load = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/expenses?year=${year}&month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setPage(1);
    } catch {
      setMessage('Failed to load expenses.');
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    if (!token) return;
    setSummaryLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/expenses/summary?year=${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load expenses summary.');
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token, year, month]);

  useEffect(() => {
    loadSummary();
  }, [token, year]);

  const create = async (event) => {
    event.preventDefault();
    if (!token || creating) return;
    setMessage('');
    setCreating(true);
    try {
      const res = await fetch(editingId ? `${API_URL}/api/admin/expenses/${editingId}` : `${API_URL}/api/admin/expenses`, {
        method: editingId ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expense_date: expenseDate,
          amount: Number(amount),
          currency,
          category,
          note: note || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || (editingId ? 'Failed to update expense.' : 'Failed to create expense.'));
      setAmount('');
      setNote('');
      setCurrency('GBP');
      setCategory('general');
      setEditingId(null);
      await load();
      await loadSummary();
    } catch (e) {
      setMessage(e?.message || (editingId ? 'Failed to update expense.' : 'Failed to create expense.'));
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setExpenseDate(item.expense_date || new Date().toISOString().slice(0, 10));
    setAmount(String(item.amount ?? ''));
    setCurrency(item.currency || 'GBP');
    setCategory(item.category || 'general');
    setNote(item.note || '');
    setMessage('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setAmount('');
    setCurrency('GBP');
    setCategory('general');
    setNote('');
  };

  const remove = async (id) => {
    if (!token) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/expenses/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to delete expense.');
      await load();
      await loadSummary();
    } catch (e) {
      setMessage(e?.message || 'Failed to delete expense.');
    }
  };

  const downloadReport = async (scope) => {
    if (!token || exporting) return;
    setMessage('');
    setExporting(scope);
    try {
      const url =
        scope === 'year'
          ? `${API_URL}/api/admin/expenses/export-year.pdf?year=${year}`
          : `${API_URL}/api/admin/expenses/export.pdf?year=${year}&month=${month}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to download expenses report.');
      }
      const blob = await res.blob();
      const urlObject = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = urlObject;
      a.download =
        scope === 'year' ? `expenses_${year}_by_month.pdf` : `expenses_${year}-${String(month).padStart(2, '0')}.pdf`;
      a.click();
      URL.revokeObjectURL(urlObject);
    } catch (e) {
      setMessage(e?.message || 'Failed to download expenses report.');
    } finally {
      setExporting('');
    }
  };

  const totalGbp = items.reduce((sum, x) => sum + (gbpAmount(x) ?? 0), 0);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const monthlyTotals = Array.isArray(summary?.month_totals) ? summary.month_totals : [];
  const categoryTotals = Array.isArray(summary?.category_totals) ? summary.category_totals : [];
  const maxMonthly = Math.max(...monthlyTotals.map((x) => Number(x.amount_gbp || 0)), 1);
  const maxCategory = Math.max(...categoryTotals.map((x) => Number(x.amount_gbp || 0)), 1);

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">Expenses</h2>
        <p className="admin-subtitle">Simple operations expenses tracker (MVP).</p>
        {message && <p className="admin-subtitle">{message}</p>}

        <form onSubmit={create}>
          <div className="admin-grid">
            <div className="admin-field">
              <label>Date</label>
              <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required />
            </div>
            <div className="admin-field">
              <label>Amount</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
            </div>
            <div className="admin-field">
              <label>Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} required>
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-field">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} required>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="admin-field">
            <label>Note</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" rows={3} />
          </div>
          <div className="admin-actions" style={{ alignItems: 'center' }}>
            <button className="admin-button" type="submit" disabled={creating}>
              {creating ? (
                <>
                  <span
                    className="admin-spinner"
                    aria-hidden="true"
                    style={{
                      width: 14,
                      height: 14,
                      borderWidth: 2,
                      borderColor: 'rgba(255,255,255,0.35)',
                      borderTopColor: '#ffffff',
                      marginTop: 0,
                    }}
                  />{' '}
                  {editingId ? 'Updating...' : 'Adding...'}
                </>
              ) : (
                editingId ? 'Update expense' : 'Add expense'
              )}
            </button>
            {editingId ? (
              <button className="admin-button secondary" type="button" onClick={cancelEdit} disabled={creating}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0 }}>Expense insights for {year}</h3>
            <p className="admin-subtitle" style={{ marginTop: 4 }}>
              See which months and categories are driving spend.
            </p>
          </div>
          <span className="admin-badge secondary">{money(summary?.total_gbp)} total</span>
        </div>
        {summaryLoading ? (
          <p className="admin-subtitle">Loading insights...</p>
        ) : !summary ? (
          <p className="admin-subtitle">No insight data available.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginTop: 14 }}>
            <div style={{ border: '1px solid #e2eee8', borderRadius: 16, padding: 16, background: '#fbfdfc' }}>
              <div className="admin-actions" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
                <strong>Monthly spend</strong>
                <span className="admin-help">GBP converted totals</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(34px, 1fr))', gap: 8, alignItems: 'end', minHeight: 190 }}>
                {monthlyTotals.map((item) => {
                  const value = Number(item.amount_gbp || 0);
                  const height = Math.max(8, Math.round((value / maxMonthly) * 150));
                  return (
                    <div key={item.month} title={`${item.label}: ${money(value)}`} style={{ display: 'grid', gap: 6, alignItems: 'end' }}>
                      <div
                        style={{
                          height,
                          borderRadius: '10px 10px 4px 4px',
                          background:
                            value > 0
                              ? `linear-gradient(180deg, ${CHART_COLORS[(Number(item.month) - 1) % CHART_COLORS.length]} 0%, #0F6E56 100%)`
                              : '#e8f1ed',
                        }}
                      />
                      <span className="admin-help" style={{ textAlign: 'center', fontSize: 11 }}>
                        {String(item.label || '').slice(0, 3)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ border: '1px solid #e2eee8', borderRadius: 16, padding: 16, background: '#fbfdfc' }}>
              <div className="admin-actions" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
                <strong>Category spend</strong>
                <span className="admin-help">Top categories</span>
              </div>
              {categoryTotals.length === 0 ? (
                <p className="admin-subtitle">No category spend yet.</p>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {categoryTotals.slice(0, 8).map((item, index) => {
                    const value = Number(item.amount_gbp || 0);
                    const width = Math.max(5, Math.round((value / maxCategory) * 100));
                    return (
                      <div key={item.category}>
                        <div className="admin-actions" style={{ justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontWeight: 700 }}>{item.label}</span>
                          <span className="admin-help">{money(value)}</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 999, background: '#e8f1ed', overflow: 'hidden', marginTop: 6 }}>
                          <div
                            style={{
                              width: `${width}%`,
                              height: '100%',
                              borderRadius: 999,
                              background: CHART_COLORS[index % CHART_COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0 }}>
              {monthLabel(month)} {year}
            </h3>
            <span
              className="admin-badge success"
              style={{ display: 'inline-flex', marginTop: 8, padding: '7px 12px', fontSize: 13, fontWeight: 800 }}
            >
              Total GBP {totalGbp.toFixed(2)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="admin-field" style={{ margin: 0, minWidth: 160 }}>
              <label>Month</label>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-field" style={{ margin: 0, width: 120 }}>
              <label>Year</label>
              <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || year))} min={2024} max={2100} />
            </div>
            <button className="admin-button info" type="button" onClick={load}>
              Refresh
            </button>
            <button className="admin-button secondary" type="button" onClick={() => downloadReport('month')} disabled={!!exporting}>
              {exporting === 'month' ? 'Preparing...' : 'Download month'}
            </button>
            <button className="admin-button neutral" type="button" onClick={() => downloadReport('year')} disabled={!!exporting}>
              {exporting === 'year' ? 'Preparing...' : 'Download year'}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="admin-subtitle">Loading...</p>
        ) : items.length === 0 ? (
          <p className="admin-subtitle">No expenses for this period.</p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 10 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>GBP value</th>
                  <th>Category</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((x) => (
                  <tr key={x.id}>
                    <td>{x.expense_date}</td>
                    <td>
                      {x.currency} {Number(x.amount).toFixed(2)}
                    </td>
                    <td>
                      {gbpAmount(x) === null ? 'Not converted' : `GBP ${gbpAmount(x).toFixed(2)}`}
                      {x.currency !== 'GBP' && x.exchange_rate_to_gbp ? (
                        <div className="admin-help">Rate {Number(x.exchange_rate_to_gbp).toFixed(6)}</div>
                      ) : null}
                    </td>
                    <td>{categoryLabel(x.category)}</td>
                    <td>{x.note || ''}</td>
                    <td>
                      <button className="admin-button info" type="button" onClick={() => startEdit(x)} style={{ marginRight: 8 }}>
                        Edit
                      </button>
                      <button className="admin-button danger" type="button" onClick={() => remove(x.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
              <span className="admin-help">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, items.length)} of {items.length}
              </span>
              <div className="admin-actions" style={{ gap: 8 }}>
                <button
                  className="admin-button secondary"
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={currentPage <= 1}
                >
                  Previous
                </button>
                <span className="admin-badge secondary">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="admin-button secondary"
                  type="button"
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
