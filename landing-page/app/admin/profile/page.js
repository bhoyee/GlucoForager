'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';
import { adminFetch, clearAdminTokens } from '../lib/adminAuth';
import { COUNTRIES } from '../lib/countries';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

function initialsFromEmail(email) {
  const e = String(email || '').trim();
  if (!e) return 'U';
  const name = e.split('@')[0] || e;
  const parts = name.replace(/[._-]+/g, ' ').split(' ').filter(Boolean);
  const a = (parts[0] || 'U')[0] || 'U';
  const b = (parts[1] || '')[0] || '';
  return (a + b).toUpperCase();
}

function countryName(code) {
  const key = String(code || '').toUpperCase();
  const found = COUNTRIES.find((c) => c.code === key);
  return found ? found.name : key || '—';
}

export default function StaffProfilePage() {
  const router = useRouter();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState(null);

  const [avatarUploading, setAvatarUploading] = useState(false);

  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMessage, setPwdMessage] = useState('');

  const load = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const res = await adminFetch(`${API_URL}/api/admin/staff/profile/me`);
      if (res.status === 401) {
        clearAdminTokens();
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load profile.');
      setProfile(data);
    } catch (e) {
      setMessage(e?.message || 'Failed to load profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const updateField = (key, value) => {
    setProfile((prev) => ({ ...(prev || {}), [key]: value }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    if (!token || !profile) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await adminFetch(`${API_URL}/api/admin/staff/profile/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: profile.full_name || null,
          country: profile.country || null,
          address: profile.address || null,
          phone_number: profile.phone_number || null,
          gender: profile.gender || null,
          next_of_kin_name: profile.next_of_kin_name || null,
          next_of_kin_contact: profile.next_of_kin_contact || null,
          next_of_kin_relationship: profile.next_of_kin_relationship || null,
          next_of_kin_address: profile.next_of_kin_address || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        clearAdminTokens();
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to save profile.');
      setProfile(data);
      setMessage('Saved.');
      try {
        window.dispatchEvent(new Event('admin-profile-updated'));
      } catch {
        // Ignore.
      }
    } catch (e) {
      setMessage(e?.message || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file) => {
    if (!file) return;
    setAvatarUploading(true);
    setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await adminFetch(`${API_URL}/api/admin/staff/profile/avatar`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        clearAdminTokens();
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to upload avatar.');
      setProfile((prev) => ({ ...(prev || {}), avatar_url: data.avatar_url }));
      setMessage('Profile picture updated.');
      try {
        window.dispatchEvent(new Event('admin-profile-updated'));
      } catch {
        // Ignore.
      }
    } catch (e) {
      setMessage(e?.message || 'Failed to upload avatar.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (!token) return;
    setPwdMessage('');
    if (!pwdNew || pwdNew.length < 8) {
      setPwdMessage('New password must be at least 8 characters.');
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setPwdMessage('Passwords do not match.');
      return;
    }
    setPwdSaving(true);
    try {
      const res = await adminFetch(`${API_URL}/api/admin/staff/password/change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: pwdCurrent, new_password: pwdNew }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        // Wrong current password is also 401; show message.
        if (String(data?.detail || '').toLowerCase().includes('invalid')) {
          setPwdMessage(data.detail);
          return;
        }
        clearAdminTokens();
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to change password.');
      setPwdCurrent('');
      setPwdNew('');
      setPwdConfirm('');
      setPwdMessage('Password updated.');
    } catch (e) {
      setPwdMessage(e?.message || 'Failed to change password.');
    } finally {
      setPwdSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-card">
        <LoadingState label="Loading profile…" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="admin-card">
        <EmptyState title="No profile" body={message || 'Please sign in again.'} />
      </div>
    );
  }

  const initials = initialsFromEmail(profile.email);

  return (
    <div className="admin-page">
      <div className="admin-card">
        <div className="admin-profile-header">
          <div className="admin-profile-avatar">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="Profile" />
            ) : (
              <div className="admin-profile-avatar-fallback" aria-hidden="true">
                {initials}
              </div>
            )}
          </div>
          <div className="admin-profile-header-main">
            <h2 className="admin-title" style={{ marginBottom: 0 }}>
              My profile
            </h2>
            <p className="admin-subtitle" style={{ marginTop: 6 }}>
              Update your contact details, next of kin, and password.
            </p>
            <p className="admin-help" style={{ margin: 0 }}>
              {profile.full_name ? profile.full_name : '—'} · {countryName(profile.country)}
            </p>
          </div>
          <div className="admin-profile-header-actions">
            <label className={`admin-button info${avatarUploading ? ' is-loading' : ''}`} style={{ cursor: avatarUploading ? 'not-allowed' : 'pointer' }}>
              {avatarUploading ? 'Uploading…' : 'Upload photo'}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                disabled={avatarUploading}
                onChange={(e) => uploadAvatar(e.target.files?.[0] || null)}
              />
            </label>
          </div>
        </div>

        {message ? <div className="admin-alert warning">{message}</div> : null}

        <div className="admin-grid" style={{ marginTop: 16 }}>
          <div className="admin-card" style={{ padding: 16 }}>
            <h3>Profile</h3>
            <form onSubmit={saveProfile}>
              <div className="admin-field">
                <label>Full name</label>
                <input value={profile.full_name || ''} onChange={(e) => updateField('full_name', e.target.value)} required />
              </div>
              <div className="admin-field">
                <label>Email</label>
                <input value={profile.email || ''} readOnly />
              </div>
              <div className="admin-field">
                <label>Country</label>
                <select value={profile.country || ''} onChange={(e) => updateField('country', e.target.value)} required>
                  <option value="">Select country</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-field">
                <label>Phone number</label>
                <input
                  value={profile.phone_number || ''}
                  onChange={(e) => updateField('phone_number', e.target.value)}
                  placeholder="+1 555 0100"
                  required
                />
              </div>
              <div className="admin-field">
                <label>Gender</label>
                <select value={profile.gender || ''} onChange={(e) => updateField('gender', e.target.value)} required>
                  <option value="">Select</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="non_binary">Non-binary</option>
                  <option value="other">Other</option>
                </select>
                <p className="admin-help" style={{ marginTop: 6 }}>
                  Non-binary means a person doesn’t identify exclusively as male or female.
                </p>
              </div>
              <div className="admin-field">
                <label>Address</label>
                <textarea value={profile.address || ''} onChange={(e) => updateField('address', e.target.value)} rows={3} required />
              </div>
              <button className="admin-button" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save profile'}
              </button>
            </form>
          </div>

          <div className="admin-card" style={{ padding: 16 }}>
            <h3>Next of kin</h3>
            <form onSubmit={saveProfile}>
              <div className="admin-field">
                <label>Name</label>
                <input value={profile.next_of_kin_name || ''} onChange={(e) => updateField('next_of_kin_name', e.target.value)} />
              </div>
              <div className="admin-field">
                <label>Contact</label>
                <input value={profile.next_of_kin_contact || ''} onChange={(e) => updateField('next_of_kin_contact', e.target.value)} placeholder="Phone or email" />
              </div>
              <div className="admin-field">
                <label>Relationship</label>
                <select value={profile.next_of_kin_relationship || ''} onChange={(e) => updateField('next_of_kin_relationship', e.target.value)}>
                  <option value="">Select</option>
                  <option value="parent">Parent</option>
                  <option value="spouse">Spouse</option>
                  <option value="sibling">Sibling</option>
                  <option value="partner">Partner</option>
                  <option value="friend">Friend</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="admin-field">
                <label>Address</label>
                <textarea value={profile.next_of_kin_address || ''} onChange={(e) => updateField('next_of_kin_address', e.target.value)} rows={3} />
              </div>
              <button className="admin-button info" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save next of kin'}
              </button>
            </form>
          </div>

          <div className="admin-card" style={{ padding: 16 }}>
            <h3>Change password</h3>
            <p className="admin-subtitle">Use a strong password (min 8 characters).</p>
            {pwdMessage ? <div className="admin-alert warning">{pwdMessage}</div> : null}
            <form onSubmit={changePassword}>
              <div className="admin-field">
                <label>Current password</label>
                <input type="password" value={pwdCurrent} onChange={(e) => setPwdCurrent(e.target.value)} required />
              </div>
              <div className="admin-field">
                <label>New password</label>
                <input type="password" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)} required />
              </div>
              <div className="admin-field">
                <label>Confirm new password</label>
                <input type="password" value={pwdConfirm} onChange={(e) => setPwdConfirm(e.target.value)} required />
              </div>
              <button className="admin-button" type="submit" disabled={pwdSaving}>
                {pwdSaving ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
