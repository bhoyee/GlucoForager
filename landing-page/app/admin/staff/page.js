'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function AdminStaffPage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [roleDrafts, setRoleDrafts] = useState({});
  const [roleDirty, setRoleDirty] = useState({});

  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newTimezone, setNewTimezone] = useState('UTC');
  const [newRoleKeys, setNewRoleKeys] = useState([]);

  const loadAll = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [uRes, rRes, pRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/staff/users?include_deleted=${includeDeleted ? '1' : '0'}`, { headers }),
        fetch(`${API_URL}/api/admin/staff/roles`, { headers }),
        fetch(`${API_URL}/api/admin/staff/permissions`, { headers }),
      ]);
      if ([uRes, rRes, pRes].some((r) => r.status === 401)) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const u = await uRes.json().catch(() => ({}));
      const r = await rRes.json().catch(() => ({}));
      const p = await pRes.json().catch(() => ({}));
      if (!uRes.ok || !rRes.ok || !pRes.ok) throw new Error(u.detail || r.detail || p.detail || 'Failed to load staff portal data.');

      const uItems = Array.isArray(u.items) ? u.items : [];
      setUsers(uItems);
      setRoles(Array.isArray(r.items) ? r.items : []);
      setPermissions(Array.isArray(p.items) ? p.items : []);

      setRoleDrafts(() => {
        const next = {};
        uItems.forEach((x) => {
          next[String(x.id)] = Array.isArray(x.roles) ? x.roles : [];
        });
        return next;
      });
      setRoleDirty(() => {
        const next = {};
        uItems.forEach((x) => {
          next[String(x.id)] = false;
        });
        return next;
      });
    } catch (e) {
      setMessage(e?.message || 'Failed to load staff portal data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [token, includeDeleted]);

  const createUser = async (event) => {
    event.preventDefault();
    if (!token) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/staff/users`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          timezone: newTimezone,
          is_active: true,
          role_keys: newRoleKeys,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to create staff user.');
      setNewEmail('');
      setNewPassword('');
      setNewTimezone('UTC');
      setNewRoleKeys([]);
      loadAll();
    } catch (e) {
      setMessage(e?.message || 'Failed to create staff user.');
    }
  };

  const saveRolesForUser = async (userId) => {
    if (!token) return;
    setMessage('');
    const draft = roleDrafts[String(userId)] || [];
    try {
      const res = await fetch(`${API_URL}/api/admin/staff/users/${userId}/roles`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_keys: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to update roles.');
      loadAll();
    } catch (e) {
      setMessage(e?.message || 'Failed to update roles.');
    }
  };

  const toggleActive = async (user) => {
    if (!token) return;
    setMessage('');
    if (user.deleted_at) {
      setMessage('Cannot change status: staff user is deleted.');
      return;
    }
    const ok = window.confirm(`${user.is_active ? 'Disable' : 'Enable'} ${user.email}?`);
    if (!ok) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/staff/users/${user.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to update staff user.');
      loadAll();
    } catch (e) {
      setMessage(e?.message || 'Failed to update staff user.');
    }
  };

  const softDelete = async (user) => {
    if (!token) return;
    setMessage('');
    if (user.deleted_at) return;
    const ok = window.confirm(`Soft delete ${user.email}? They will not be able to log in.`);
    if (!ok) return;
    const reason = window.prompt('Reason (optional):') || '';
    try {
      const res = await fetch(`${API_URL}/api/admin/staff/users/${user.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to delete staff user.');
      loadAll();
    } catch (e) {
      setMessage(e?.message || 'Failed to delete staff user.');
    }
  };

  const roleOptions = roles.map((r) => ({ key: r.key, name: r.name }));

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">Staff Portal</h2>
        <p className="admin-subtitle">Create staff accounts and assign roles/permissions.</p>
        {message && <p className="admin-subtitle">{message}</p>}

        <div className="admin-actions" style={{ gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} /> Show deleted
          </label>
          <button className="admin-button secondary" type="button" onClick={loadAll}>
            Refresh
          </button>
        </div>

        <div className="admin-grid" style={{ marginTop: 16 }}>
          <div className="admin-card" style={{ padding: 16 }}>
            <h3>Create Staff</h3>
            <form onSubmit={createUser}>
              <div className="admin-field">
                <label>Email</label>
                <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
              </div>
              <div className="admin-field">
                <label>Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              </div>
              <div className="admin-field">
                <label>Timezone</label>
                <input value={newTimezone} onChange={(e) => setNewTimezone(e.target.value)} placeholder="UTC" />
              </div>
              <div className="admin-field">
                <label>Roles</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {roleOptions.map((r) => (
                    <label key={r.key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={newRoleKeys.includes(r.key)}
                        onChange={(e) => {
                          setNewRoleKeys((prev) => {
                            if (e.target.checked) return Array.from(new Set([...prev, r.key]));
                            return prev.filter((x) => x !== r.key);
                          });
                        }}
                      />
                      <span>{r.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button className="admin-button" type="submit">
                Create
              </button>
            </form>
          </div>

          <div className="admin-card" style={{ padding: 16 }}>
            <h3>Roles & Permissions</h3>
            <p className="admin-subtitle">Roles live in the database. Permissions are assigned per role and enforced by the backend.</p>
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              <ul>
                {roles.map((r) => (
                  <li key={r.id}>
                    <strong>{r.name}</strong> <span style={{ opacity: 0.7 }}>({r.key})</span>
                  </li>
                ))}
              </ul>
            </div>
            <details style={{ marginTop: 12 }}>
              <summary>View permission keys</summary>
              <div style={{ marginTop: 8, maxHeight: 220, overflow: 'auto' }}>
                <ul>
                  {permissions.map((p) => (
                    <li key={p.id}>
                      <code>{p.key}</code> — {p.name}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </div>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <h3>Staff Users</h3>
        {loading ? (
          <LoadingState label="Loading staff users…" />
        ) : users.length === 0 ? (
          <EmptyState title="No staff users yet" body="Create a staff account to grant access to the portal." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Timezone</th>
                  <th>Status</th>
                  <th>Roles</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const idKey = String(u.id);
                  const isDeleted = Boolean(u.deleted_at);
                  const statusLabel = isDeleted ? 'Deleted' : u.is_active ? 'Active' : 'Disabled';
                  return (
                    <tr key={u.id} style={isDeleted ? { opacity: 0.7 } : undefined}>
                      <td>{u.email}</td>
                      <td>{u.timezone}</td>
                      <td>{statusLabel}</td>
                      <td>
                        <select
                          multiple
                          value={roleDrafts[idKey] || []}
                          disabled={isDeleted}
                          onChange={(e) => {
                            const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                            setRoleDrafts((prev) => ({ ...prev, [idKey]: selected }));
                            setRoleDirty((prev) => ({ ...prev, [idKey]: true }));
                          }}
                          style={{ minWidth: 220, minHeight: 80 }}
                        >
                          {roleOptions.map((r) => (
                            <option key={r.key} value={r.key}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        {roleDirty[idKey] && !isDeleted ? (
                          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="admin-button secondary" type="button" onClick={() => saveRolesForUser(u.id)}>
                              Save roles
                            </button>
                            <button
                              className="admin-button secondary"
                              type="button"
                              onClick={() => {
                                setRoleDrafts((prev) => ({ ...prev, [idKey]: Array.isArray(u.roles) ? u.roles : [] }));
                                setRoleDirty((prev) => ({ ...prev, [idKey]: false }));
                              }}
                            >
                              Reset
                            </button>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="admin-button secondary" type="button" onClick={() => toggleActive(u)} disabled={isDeleted}>
                            {u.is_active ? 'Disable' : 'Enable'}
                          </button>
                          <button className="admin-button" type="button" onClick={() => softDelete(u)} disabled={isDeleted}>
                            Soft delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
