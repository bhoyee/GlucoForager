'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function roleLabel(roles) {
  const list = Array.isArray(roles) ? roles : [];
  const key = String(list[0] || '').trim().toLowerCase();
  if (!key) return '—';
  if (key === 'hr') return 'HR';
  if (key === 'admin') return 'Admin';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export default function MyTeamPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const debounceTimer = useRef(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [session, setSession] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadSession = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSession(data);
    } catch {
      setSession(null);
    }
  };

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setMessage('');
    try {
      const qs = new URLSearchParams();
      if (debouncedQuery) qs.set('q', debouncedQuery);
      const res = await fetch(`${API_URL}/api/admin/staff/team?${qs.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load team.');
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setMessage(e?.message || 'Failed to load team.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, [token]);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(String(query || '').trim()), 250);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  useEffect(() => {
    load();
  }, [token, debouncedQuery]);

  const rows = Array.isArray(items) ? items : [];

  const canView = Array.isArray(session?.permissions) ? session.permissions.includes('*') || session.permissions.includes('staff.team.read') : false;

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">My Team</h2>
        <p className="admin-subtitle">Your internal staff directory (name, email, role).</p>
        {message ? <div className="admin-alert warning">{message}</div> : null}

        <div className="admin-toolbar-grid" style={{ marginTop: 12 }}>
          <div className="admin-toolbar-search">
            <input className="admin-search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email…" />
          </div>
          <div className="admin-toolbar-actions" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button className="admin-button neutral" type="button" onClick={load} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        {!canView && !loading ? <div className="admin-alert danger">Permission denied.</div> : null}
        {loading ? <LoadingState label="Loading team…" /> : null}
        {!loading && canView && rows.length === 0 ? (
          <EmptyState title="No team members found" description="Try clearing your search or ask an admin to add staff accounts." />
        ) : null}

        {!loading && canView && rows.length > 0 ? (
          <DataTable
            rows={rows}
            rowKey={(r) => String(r.id)}
            pageSize={15}
            columns={[
              {
                key: 'full_name',
                header: 'Name',
                sortable: true,
                accessor: (r) => String(r.full_name || ''),
                render: (r) => (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 800 }}>{String(r.full_name || '—')}</span>
                    <span className="admin-subtitle">{String(r.email || '')}</span>
                  </div>
                ),
                sortValue: (r) => String(r.full_name || r.email || ''),
              },
              {
                key: 'role',
                header: 'Role',
                sortable: true,
                accessor: (r) => roleLabel(r.roles),
                render: (r) => <span className="admin-badge secondary">{roleLabel(r.roles)}</span>,
                sortValue: (r) => roleLabel(r.roles),
              },
            ]}
          />
        ) : null}
      </div>
    </div>
  );
}

