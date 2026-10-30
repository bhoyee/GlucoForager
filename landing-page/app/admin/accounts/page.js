'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const SOURCE_OPTIONS = [
  { value: 'app_store', label: 'App Store (Apple)' },
  { value: 'google_play', label: 'Google Play' },
  { value: 'stripe', label: 'Stripe / web' },
  { value: 'other', label: 'Other' },
];
const CURRENCY_OPTIONS = ['GBP', 'USD', 'NGN'];

const gbp = (value) => `£${Number(value || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDate = (iso) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

const currentTaxYearStart = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 3, 6);
  return now >= start ? now.getFullYear() : now.getFullYear() - 1;
};

const emptyForm = () => ({ income_date: new Date().toISOString().slice(0, 10), amount: '', currency: 'GBP', source: 'app_store', note: '' });

export default function AccountsPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);
  const thisYear = useMemo(() => currentTaxYearStart(), []);
  const yearOptions = useMemo(() => [thisYear + 1, thisYear, thisYear - 1, thisYear - 2], [thisYear]);

  const [taxYear, setTaxYear] = useState(thisYear);
  const [summary, setSummary] = useState(null);
  const [income, setIncome] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const fileInput = useRef(null);
  const uploadFor = useRef(null);

  const api = async (path, options = {}) => {
    const res = await fetch(`${API_URL}/api/admin/accounts${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    if (res.status === 401) {
      localStorage.removeItem('adminToken');
      router.push('/admin');
      throw new Error('Signed out');
    }
    return res;
  };

  const load = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setLoading(true);
    try {
      const [s, i] = await Promise.all([api(`/tax-year?start_year=${taxYear}`), api(`/income?tax_year=${taxYear}`)]);
      if (!s.ok || !i.ok) throw new Error();
      setSummary(await s.json());
      setIncome((await i.json()).items || []);
    } catch {
      setMessage('Failed to load the accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token, taxYear]);

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await api(editingId ? `/income/${editingId}` : '/income', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount), note: form.note || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to save income.');
      setForm(emptyForm());
      setEditingId(null);
      await load();
    } catch (e) {
      setMessage(e?.message || 'Failed to save income.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({ income_date: item.income_date, amount: String(item.amount), currency: item.currency, source: item.source, note: item.note || '' });
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete this ${gbp(item.amount_gbp ?? item.amount)} income record?`)) return;
    setBusyId(item.id);
    try {
      const res = await api(`/income/${item.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setMessage('Failed to delete income.');
    } finally {
      setBusyId(null);
    }
  };

  const pickDocument = (id) => {
    uploadFor.current = id;
    fileInput.current?.click();
  };

  const uploadDocument = async (event) => {
    const file = event.target.files?.[0];
    const id = uploadFor.current;
    event.target.value = '';
    if (!file || !id) return;
    setBusyId(id);
    setMessage('');
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await api(`/income/${id}/document`, { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Upload failed.');
      await load();
    } catch (e) {
      setMessage(e?.message || 'Upload failed.');
    } finally {
      setBusyId(null);
    }
  };

  const removeDocument = async (id) => {
    if (!window.confirm('Remove this statement? The income record itself stays.')) return;
    setBusyId(id);
    setMessage('');
    try {
      const res = await api(`/income/${id}/document`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setMessage('Failed to remove the statement.');
    } finally {
      setBusyId(null);
    }
  };

  const openDocument = async (id) => {
    try {
      const res = await api(`/income/${id}/document`);
      if (!res.ok) throw new Error();
      window.open(URL.createObjectURL(await res.blob()), '_blank');
    } catch {
      setMessage('Could not open the statement.');
    }
  };

  const downloadCsv = async () => {
    try {
      const res = await api(`/tax-year.csv?start_year=${taxYear}`);
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `accounts_${summary?.label?.replace('/', '-') || taxYear}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage('Failed to download the CSV.');
    }
  };

  const s = summary;
  const over = s?.allowance_status === 'over';
  const counts = s?.counts || {};

  return (
    <div className="admin-page">
      <div className="admin-card">
        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="admin-title">Accounts</h2>
            <p className="admin-subtitle">
              Income, expenses and profit for the UK tax year (6 April to 5 April), ready for Self Assessment.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="admin-field" style={{ margin: 0, minWidth: 150 }}>
              <label>Tax year</label>
              <select value={taxYear} onChange={(e) => setTaxYear(Number(e.target.value))}>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}/{String(y + 1).slice(-2)}
                    {y === thisYear ? ' (current)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <button className="admin-button secondary" type="button" onClick={downloadCsv} disabled={!s}>
              Download CSV
            </button>
          </div>
        </div>
        {message && <p className="admin-subtitle">{message}</p>}

        {loading || !s ? (
          <p className="admin-subtitle">Loading...</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
              {[
                ['Income', s.income_total_gbp, `${counts.income} records`],
                ['Allowable expenses', s.expense_total_gbp, `${counts.expenses} records`],
                ['Profit', s.profit_gbp, s.profit_gbp < 0 ? 'A loss this year' : 'Income minus expenses'],
              ].map(([label, value, help]) => (
                <div key={label} style={{ border: '1px solid #e2eee8', borderRadius: 14, padding: 14, background: '#fbfdfc' }}>
                  <div className="admin-help">{label}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{gbp(value)}</div>
                  <div className="admin-help">{help}</div>
                </div>
              ))}
            </div>

            <div style={{ border: '1px solid #e2eee8', borderRadius: 14, padding: 16, marginTop: 12 }}>
              <div className="admin-actions" style={{ justifyContent: 'space-between' }}>
                <strong>£1,000 trading allowance</strong>
                <span className={`admin-badge ${over ? 'warning' : 'success'}`}>
                  {over ? 'Over: report to HMRC' : 'Under: nothing to report'}
                </span>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: '#e8f1ed', overflow: 'hidden', marginTop: 10 }}>
                <div
                  style={{ width: `${Math.max(2, s.allowance_used_pct)}%`, height: '100%', borderRadius: 999, background: over ? '#BA7517' : '#1D9E75' }}
                />
              </div>
              <p className="admin-help" style={{ marginTop: 8 }}>
                {gbp(s.income_total_gbp)} of {gbp(s.trading_allowance_gbp)} income this tax year.{' '}
                {over
                  ? `Register as self-employed by ${longDate(s.deadlines.register_by)}, then file and pay by ${longDate(s.deadlines.file_and_pay_by)}. ${
                      s.deduction_method === 'trading_allowance'
                        ? 'Claiming the £1,000 allowance beats your actual expenses this year.'
                        : 'Your actual expenses beat the £1,000 allowance, so claim those.'
                    } Taxable profit: ${gbp(s.taxable_profit_gbp)}.`
                  : 'While income stays at £1,000 or less in a tax year, you don’t need to register or report it. Keep recording everything anyway.'}
              </p>
            </div>

            <div style={{ border: '1px solid #e2eee8', borderRadius: 14, padding: 16, marginTop: 12 }}>
              <strong>Record-keeping checklist</strong>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: 18, lineHeight: 1.8 }}>
                <li>
                  {counts.expenses_missing_receipt === 0 ? '✓ Every expense has a receipt.' : `${counts.expenses_missing_receipt} expense(s) without a receipt: attach them on the Expenses page.`}
                </li>
                <li>
                  {counts.income_missing_document === 0
                    ? '✓ Every income record has a statement.'
                    : `${counts.income_missing_document} income record(s) without a payout statement.`}
                </li>
                {counts.unconverted > 0 ? <li>{counts.unconverted} record(s) could not be converted to GBP.</li> : null}
                <li>Keep these records for at least 5 years after the 31 January filing deadline.</li>
              </ul>
            </div>

            {s.expense_by_category.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <strong>Expenses by category</strong>
                <table className="admin-table" style={{ marginTop: 8 }}>
                  <tbody>
                    {s.expense_by_category.map((c) => (
                      <tr key={c.category}>
                        <td>{c.label}</td>
                        <td style={{ textAlign: 'right' }}>{gbp(c.amount_gbp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <h3 style={{ margin: 0 }}>{editingId ? 'Edit income' : 'Record income'}</h3>
        <p className="admin-subtitle" style={{ marginTop: 4 }}>
          Add each payout as it lands in the bank: App Store Connect (Payments and Financial Reports), Google Play Console
          (Payouts) or Stripe. Enter the amount you actually received, after the store&apos;s commission and VAT (for example,
          a £5.99 UK subscription pays out about £4.24), and attach the payout statement.
        </p>
        <form onSubmit={save}>
          <div className="admin-grid">
            <div className="admin-field">
              <label>Date received</label>
              <input type="date" value={form.income_date} onChange={(e) => setForm({ ...form, income_date: e.target.value })} required />
            </div>
            <div className="admin-field">
              <label>Amount received</label>
              <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" required />
            </div>
            <div className="admin-field">
              <label>Currency</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-field">
              <label>Source</label>
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="admin-field">
            <label>Note</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. October payout" />
          </div>
          <div className="admin-actions">
            <button className="admin-button" type="submit" disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update income' : 'Add income'}
            </button>
            {editingId ? (
              <button className="admin-button secondary" type="button" onClick={() => { setEditingId(null); setForm(emptyForm()); }}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>

        <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: 'none' }} onChange={uploadDocument} />
        {income.length === 0 ? (
          <p className="admin-subtitle" style={{ marginTop: 16 }}>No income recorded for this tax year.</p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 16 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Amount</th>
                  <th>GBP value</th>
                  <th>Note</th>
                  <th>Statement</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {income.map((x) => (
                  <tr key={x.id}>
                    <td>{x.income_date}</td>
                    <td>{x.source_label}</td>
                    <td>
                      {x.currency} {Number(x.amount).toFixed(2)}
                    </td>
                    <td>{x.amount_gbp === null ? 'Not converted' : gbp(x.amount_gbp)}</td>
                    <td>{x.note || ''}</td>
                    <td>
                      {x.has_document ? (
                        <span className="admin-attachment">
                          <button className="admin-button neutral" type="button" onClick={() => openDocument(x.id)} title={x.document_name || ''}>
                            View
                          </button>
                          <button
                            className="admin-attachment-remove"
                            type="button"
                            onClick={() => removeDocument(x.id)}
                            disabled={busyId === x.id}
                            title="Remove statement"
                            aria-label="Remove statement"
                          >
                            ×
                          </button>
                        </span>
                      ) : (
                        <button className="admin-button secondary" type="button" onClick={() => pickDocument(x.id)} disabled={busyId === x.id}>
                          {busyId === x.id ? 'Uploading...' : 'Attach'}
                        </button>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="admin-button info" type="button" onClick={() => startEdit(x)} style={{ marginRight: 8 }}>
                        Edit
                      </button>
                      <button className="admin-button danger" type="button" onClick={() => remove(x)} disabled={busyId === x.id}>
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
