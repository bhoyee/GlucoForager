'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function ExpensesPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

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
    } catch {
      setMessage('Failed to load expenses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token, year, month]);

  const create = async (event) => {
    event.preventDefault();
    if (!token) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/expenses`, {
        method: 'POST',
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
      if (!res.ok) throw new Error(data.detail || 'Failed to create expense.');
      setAmount('');
      setNote('');
      load();
    } catch (e) {
      setMessage(e?.message || 'Failed to create expense.');
    }
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
      load();
    } catch (e) {
      setMessage(e?.message || 'Failed to delete expense.');
    }
  };

  const total = items.reduce((sum, x) => sum + (x.currency === currency ? Number(x.amount) : 0), 0);

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
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </div>
            <div className="admin-field">
              <label>Category</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
          </div>
          <div className="admin-field">
            <label>Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </div>
          <button className="admin-button" type="submit">
            Add expense
          </button>
        </form>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>
            {year}-{String(month).padStart(2, '0')} ({currency} total: {total.toFixed(2)})
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || year))} style={{ width: 90 }} />
            <input type="number" value={month} onChange={(e) => setMonth(Number(e.target.value || month))} min={1} max={12} style={{ width: 70 }} />
            <button className="admin-button info" type="button" onClick={load}>
              Refresh
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
                  <th>Category</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.id}>
                    <td>{x.expense_date}</td>
                    <td>
                      {x.currency} {Number(x.amount).toFixed(2)}
                    </td>
                    <td>{x.category}</td>
                    <td>{x.note || ''}</td>
                    <td>
                      <button className="admin-button secondary" type="button" onClick={() => remove(x.id)}>
                        Delete
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
  );
}
