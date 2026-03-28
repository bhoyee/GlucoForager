const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export function getAdminAccessToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('adminToken');
}

export function getAdminRefreshToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('adminRefreshToken');
}

export function setAdminTokens({ accessToken, refreshToken }) {
  if (typeof window === 'undefined') return;
  if (accessToken) localStorage.setItem('adminToken', accessToken);
  if (refreshToken) localStorage.setItem('adminRefreshToken', refreshToken);
}

export function clearAdminTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminRefreshToken');
}

export async function refreshAdminAccessToken() {
  const refreshToken = getAdminRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_URL}/api/admin/staff/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.access_token) return null;
    setAdminTokens({ accessToken: data.access_token });
    return data.access_token;
  } catch {
    return null;
  }
}

export async function adminFetch(url, options = {}) {
  const accessToken = getAdminAccessToken();
  const headers = { ...(options.headers || {}) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const first = await fetch(url, { ...options, headers });
  if (first.status !== 401) return first;

  const refreshed = await refreshAdminAccessToken();
  if (!refreshed) return first;

  const headers2 = { ...(options.headers || {}), Authorization: `Bearer ${refreshed}` };
  return fetch(url, { ...options, headers: headers2 });
}

