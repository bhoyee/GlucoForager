'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function AdminUserDetail() {
  const router = useRouter();
  const params = useParams();
  const userId = params?.id;
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [user, setUser] = useState(null);
  const [form, setForm] = useState({
    email: '',
    full_name: '',
    gender: '',
    country: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadUser = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setIsLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage('Failed to load user.');
        return;
      }
      const data = await response.json();
      setUser(data);
      setForm({
        email: data.email || '',
        full_name: data.full_name || '',
        gender: data.gender || '',
        country: data.country || '',
      });
    } catch (error) {
      setMessage('Failed to load user.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      loadUser();
    }
  }, [userId]);

  const handleSave = async () => {
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage('Failed to update user.');
        return;
      }
      setMessage('User updated.');
      loadUser();
    } catch (error) {
      setMessage('Failed to update user.');
    }
  };

  const handleTierChange = async () => {
    if (!user) return;
    const nextTier = user.subscription_tier === 'premium' ? 'free' : 'premium';
    if (!confirm(`Change ${user.email} to ${nextTier}?`)) return;
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/tier`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: nextTier }),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage('Failed to update subscription.');
        return;
      }
      loadUser();
    } catch (error) {
      setMessage('Failed to update subscription.');
    }
  };

  const handleSuspend = async () => {
    if (!user) return;
    if (!confirm(`Suspend ${user.email}? They will be unable to log in.`)) return;
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/suspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Account locked by admin.' }),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage('Failed to suspend user.');
        return;
      }
      loadUser();
    } catch (error) {
      setMessage('Failed to suspend user.');
    }
  };

  const handleUnsuspend = async () => {
    if (!user) return;
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/unsuspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage('Failed to unsuspend user.');
        return;
      }
      loadUser();
    } catch (error) {
      setMessage('Failed to unsuspend user.');
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    if (!confirm(`Delete ${user.email} permanently? This cannot be undone.`)) return;
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage('Failed to delete user.');
        return;
      }
      router.push('/admin/users');
    } catch (error) {
      setMessage('Failed to delete user.');
    }
  };

  if (isLoading) {
    return <div className="admin-card">Loading user...</div>;
  }

  if (!user) {
    return <div className="admin-card">User not found.</div>;
  }

  return (
    <div className="admin-card">
      <div className="admin-actions">
        <button className="admin-button secondary" type="button" onClick={() => router.push('/admin/users')}>
          Back to Users
        </button>
        <button className="admin-button" type="button" onClick={handleTierChange}>
          {user.subscription_tier === 'premium' ? 'Downgrade' : 'Upgrade'}
        </button>
        {user.suspended_at ? (
          <button className="admin-button secondary" type="button" onClick={handleUnsuspend}>
            Unsuspend
          </button>
        ) : (
          <button className="admin-button danger" type="button" onClick={handleSuspend}>
            Suspend
          </button>
        )}
        <button className="admin-button danger" type="button" onClick={handleDelete}>
          Delete
        </button>
      </div>

      <h2 className="admin-title">User Details</h2>
      <p className="admin-subtitle">Manage profile and subscription status.</p>
      {message && <p className="admin-subtitle">{message}</p>}

      <div className="admin-grid">
        <div>
          <div className="admin-field">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </div>
          <div className="admin-field">
            <label>Full name</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(event) => setForm({ ...form, full_name: event.target.value })}
            />
          </div>
          <div className="admin-inline">
            <div className="admin-field">
              <label>Gender</label>
              <input
                type="text"
                value={form.gender}
                onChange={(event) => setForm({ ...form, gender: event.target.value })}
              />
            </div>
            <div className="admin-field">
              <label>Country</label>
              <input
                type="text"
                value={form.country}
                onChange={(event) => setForm({ ...form, country: event.target.value })}
              />
            </div>
          </div>
          <div className="admin-actions">
            <button className="admin-button" type="button" onClick={handleSave}>
              Save changes
            </button>
          </div>
        </div>

        <div>
          <div className="admin-card">
            <h3 className="admin-title">Subscription</h3>
            <p className="admin-subtitle">
              Plan: <strong>{user.subscription_tier}</strong>
            </p>
            <p className="admin-subtitle">
              Status: <strong>{user.status}</strong>
            </p>
            <p className="admin-subtitle">
              Expires: <strong>{user.expires_at ? new Date(user.expires_at).toLocaleDateString() : '—'}</strong>
            </p>
            <p className="admin-subtitle">
              Suspended: <strong>{user.suspended_at ? new Date(user.suspended_at).toLocaleString() : 'No'}</strong>
            </p>
          </div>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: '24px' }}>
        <h3 className="admin-title">Transactions</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Plan</th>
              <th>Started</th>
              <th>Expires</th>
              <th>Product</th>
              <th>Transaction</th>
              <th>Store</th>
            </tr>
          </thead>
          <tbody>
            {user.subscriptions?.length ? (
              user.subscriptions.map((sub) => (
                <tr key={sub.id}>
                  <td>{sub.status}</td>
                  <td>{sub.plan}</td>
                  <td>{sub.started_at ? new Date(sub.started_at).toLocaleDateString() : '—'}</td>
                  <td>{sub.expires_at ? new Date(sub.expires_at).toLocaleDateString() : '—'}</td>
                  <td>{sub.product_id || '—'}</td>
                  <td>{sub.transaction_id || '—'}</td>
                  <td>{sub.store || '—'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>No subscription history.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
