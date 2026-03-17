'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function AdminNotificationsPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [enabled, setEnabled] = useState(false);
  const [recipients, setRecipients] = useState('');
  const [updatesEnabled, setUpdatesEnabled] = useState(false);
  const [androidLatestVersion, setAndroidLatestVersion] = useState('');
  const [iosLatestVersion, setIosLatestVersion] = useState('');
  const [androidStoreUrl, setAndroidStoreUrl] = useState('');
  const [iosStoreUrl, setIosStoreUrl] = useState('');
  const [recipeImagesEnabled, setRecipeImagesEnabled] = useState(false);
  const [recipeImageSize, setRecipeImageSize] = useState(512);
  const [recipeImagesFreeDailyLimit, setRecipeImagesFreeDailyLimit] = useState(1);
  const [recipeImagesPremiumDailyLimit, setRecipeImagesPremiumDailyLimit] = useState(10);
  const [recipeImagesMaxPerRecipe, setRecipeImagesMaxPerRecipe] = useState(1);
  const [recipeImagesCostUsd, setRecipeImagesCostUsd] = useState(0.04);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const loadSettings = async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setIsLoading(true);
    setMessage('');
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [signupRes, updatesRes, recipeImagesRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/settings/signup-notifications`, { headers }),
        fetch(`${API_URL}/api/admin/settings/app-updates`, { headers }),
        fetch(`${API_URL}/api/admin/settings/recipe-images`, { headers }),
      ]);
      if (signupRes.status === 401 || updatesRes.status === 401 || recipeImagesRes.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const signup = await signupRes.json().catch(() => ({}));
      setEnabled(Boolean(signup.enabled));
      const list = Array.isArray(signup.recipients) ? signup.recipients : [];
      setRecipients(list.join(', '));

      const updates = await updatesRes.json().catch(() => ({}));
      setUpdatesEnabled(Boolean(updates.enabled));
      setAndroidLatestVersion(updates.android_latest_version || '');
      setIosLatestVersion(updates.ios_latest_version || '');
      setAndroidStoreUrl(updates.android_store_url || '');
      setIosStoreUrl(updates.ios_store_url || '');

      const recipeImages = await recipeImagesRes.json().catch(() => ({}));
      setRecipeImagesEnabled(Boolean(recipeImages.enabled));
      setRecipeImageSize(Number(recipeImages.size) || 512);
      setRecipeImagesFreeDailyLimit(Number(recipeImages.free_daily_limit) ?? 1);
      setRecipeImagesPremiumDailyLimit(Number(recipeImages.premium_daily_limit) ?? 10);
      setRecipeImagesMaxPerRecipe(Number(recipeImages.max_per_recipe) ?? 1);
      setRecipeImagesCostUsd(
        recipeImages.cost_usd !== undefined && recipeImages.cost_usd !== null
          ? Number(recipeImages.cost_usd) || 0.04
          : 0.04
      );
    } catch (error) {
      setMessage('Failed to load notification settings.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, [token]);

  const parseRecipients = () =>
    recipients
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

  const save = async () => {
    if (!token) return;
    setBusy(true);
    setMessage('');
    try {
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const [signupRes, updatesRes, recipeImagesRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/settings/signup-notifications`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ enabled, recipients: parseRecipients() }),
        }),
        fetch(`${API_URL}/api/admin/settings/app-updates`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            enabled: updatesEnabled,
            android_latest_version: androidLatestVersion.trim() || null,
            ios_latest_version: iosLatestVersion.trim() || null,
            android_store_url: androidStoreUrl.trim() || null,
            ios_store_url: iosStoreUrl.trim() || null,
          }),
        }),
        fetch(`${API_URL}/api/admin/settings/recipe-images`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            enabled: recipeImagesEnabled,
            size: Number(recipeImageSize) || 512,
            free_daily_limit: Number(recipeImagesFreeDailyLimit) ?? 1,
            premium_daily_limit: Number(recipeImagesPremiumDailyLimit) ?? 10,
            max_per_recipe: Number(recipeImagesMaxPerRecipe) ?? 1,
            cost_usd: Number(recipeImagesCostUsd) || 0,
          }),
        }),
      ]);
      if (signupRes.status === 401 || updatesRes.status === 401 || recipeImagesRes.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const signup = await signupRes.json().catch(() => ({}));
      const updates = await updatesRes.json().catch(() => ({}));
      const recipeImages = await recipeImagesRes.json().catch(() => ({}));
      if (!signupRes.ok || !updatesRes.ok || !recipeImagesRes.ok) {
        setMessage(
          signup?.detail ||
            updates?.detail ||
            recipeImages?.detail ||
            'Failed to save notification settings.'
        );
        return;
      }
      setEnabled(Boolean(signup.enabled));
      const list = Array.isArray(signup.recipients) ? signup.recipients : [];
      setRecipients(list.join(', '));

      setUpdatesEnabled(Boolean(updates.enabled));
      setAndroidLatestVersion(updates.android_latest_version || '');
      setIosLatestVersion(updates.ios_latest_version || '');
      setAndroidStoreUrl(updates.android_store_url || '');
      setIosStoreUrl(updates.ios_store_url || '');

      setRecipeImagesEnabled(Boolean(recipeImages.enabled));
      setRecipeImageSize(Number(recipeImages.size) || 512);
      setRecipeImagesFreeDailyLimit(Number(recipeImages.free_daily_limit) ?? 1);
      setRecipeImagesPremiumDailyLimit(Number(recipeImages.premium_daily_limit) ?? 10);
      setRecipeImagesMaxPerRecipe(Number(recipeImages.max_per_recipe) ?? 1);
      setRecipeImagesCostUsd(
        recipeImages.cost_usd !== undefined && recipeImages.cost_usd !== null
          ? Number(recipeImages.cost_usd) || 0.04
          : 0.04
      );
      setMessage('Settings saved.');
    } catch (error) {
      setMessage('Failed to save notification settings.');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    if (!token) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/settings/signup-notifications/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setMessage(data?.detail || 'Failed to send test notification.');
        return;
      }
      setMessage(`Test email sent to: ${(data.recipients || []).join(', ')}`);
    } catch (error) {
      setMessage('Failed to send test notification.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="admin-card">
        <h2 className="admin-title">Notifications</h2>
        <p className="admin-loading">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="admin-card">
      <h2 className="admin-title">Notifications</h2>
      <p className="admin-subtitle">Configure admin email alerts for key events.</p>

      {message ? <p className="admin-subtitle">{message}</p> : null}

      <div className="admin-card" style={{ marginTop: 16 }}>
        <h3 className="admin-title">New user signups</h3>
        <p className="admin-subtitle">
          Send an email alert when a new user creates an account.
        </p>

        <label className="admin-inline-toggle" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            disabled={busy}
          />
          <span>Enable signup email alerts</span>
        </label>

        <div className="admin-field" style={{ marginTop: 12 }}>
          <label>Recipients (comma-separated)</label>
          <input
            type="text"
            placeholder="admin@glucoforager.com, support@glucoforager.com"
            value={recipients}
            onChange={(event) => setRecipients(event.target.value)}
            disabled={busy}
          />
        </div>

        <div className="admin-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="admin-button" type="button" onClick={save} disabled={busy}>
            {busy ? 'Working...' : 'Save'}
          </button>
          <button className="admin-button secondary" type="button" onClick={sendTest} disabled={busy}>
            Send test email
          </button>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <h3 className="admin-title">App updates</h3>
        <p className="admin-subtitle">
          Show an in-app prompt when a newer version is available on the App Store / Play Store.
        </p>

        <label className="admin-inline-toggle" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={updatesEnabled}
            onChange={(event) => setUpdatesEnabled(event.target.checked)}
            disabled={busy}
          />
          <span>Enable in-app update prompt</span>
        </label>

        <div className="admin-grid" style={{ marginTop: 12 }}>
          <div className="admin-field">
            <label>Android latest version (e.g. 1.0.2)</label>
            <input
              type="text"
              value={androidLatestVersion}
              onChange={(event) => setAndroidLatestVersion(event.target.value)}
              placeholder="1.0.2"
              disabled={busy}
            />
          </div>
          <div className="admin-field">
            <label>iOS latest version (e.g. 1.0.2)</label>
            <input
              type="text"
              value={iosLatestVersion}
              onChange={(event) => setIosLatestVersion(event.target.value)}
              placeholder="1.0.2"
              disabled={busy}
            />
          </div>
        </div>

        <div className="admin-grid">
          <div className="admin-field">
            <label>Android store URL (optional)</label>
            <input
              type="text"
              value={androidStoreUrl}
              onChange={(event) => setAndroidStoreUrl(event.target.value)}
              placeholder="https://play.google.com/store/apps/details?id=com.glucoforager.app"
              disabled={busy}
            />
          </div>
          <div className="admin-field">
            <label>iOS store URL (optional)</label>
            <input
              type="text"
              value={iosStoreUrl}
              onChange={(event) => setIosStoreUrl(event.target.value)}
              placeholder="https://apps.apple.com/us/app/glucoforager/id6758808427"
              disabled={busy}
            />
          </div>
        </div>

        <div className="admin-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="admin-button" type="button" onClick={save} disabled={busy}>
            {busy ? 'Working...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <h3 className="admin-title">Recipe images</h3>
        <p className="admin-subtitle">
          Control AI recipe image generation (cost-sensitive). Images are only generated when users tap "Generate image".
        </p>

        <label className="admin-inline-toggle" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={recipeImagesEnabled}
            onChange={(event) => setRecipeImagesEnabled(event.target.checked)}
            disabled={busy}
          />
          <span>Enable recipe image generation</span>
        </label>

        <div className="admin-grid" style={{ marginTop: 12 }}>
          <div className="admin-field">
            <label>Image size (default)</label>
            <select
              value={String(recipeImageSize)}
              onChange={(event) => setRecipeImageSize(Number(event.target.value) || 512)}
              disabled={busy}
            >
              <option value="512">512 × 512 (recommended)</option>
              <option value="768">768 × 768</option>
              <option value="1024">1024 × 1024</option>
            </select>
          </div>
          <div className="admin-field">
            <label>Max generations per recipe (per day)</label>
            <input
              type="number"
              min={1}
              max={50}
              value={recipeImagesMaxPerRecipe}
              onChange={(event) => setRecipeImagesMaxPerRecipe(Number(event.target.value) || 1)}
              disabled={busy}
            />
          </div>
          <div className="admin-field">
            <label>Estimated cost per image (USD)</label>
            <input
              type="number"
              min={0}
              max={10}
              step={0.001}
              value={recipeImagesCostUsd}
              onChange={(event) => setRecipeImagesCostUsd(Number(event.target.value) || 0)}
              disabled={busy}
            />
          </div>
        </div>

        <div className="admin-grid">
          <div className="admin-field">
            <label>Free daily image limit</label>
            <input
              type="number"
              min={0}
              max={500}
              value={recipeImagesFreeDailyLimit}
              onChange={(event) => setRecipeImagesFreeDailyLimit(Number(event.target.value) ?? 0)}
              disabled={busy}
            />
          </div>
          <div className="admin-field">
            <label>Premium daily image limit (-1 = unlimited)</label>
            <input
              type="number"
              min={-1}
              max={5000}
              value={recipeImagesPremiumDailyLimit}
              onChange={(event) => setRecipeImagesPremiumDailyLimit(Number(event.target.value) ?? 10)}
              disabled={busy}
            />
          </div>
        </div>

        <div className="admin-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="admin-button" type="button" onClick={save} disabled={busy}>
            {busy ? 'Working...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
