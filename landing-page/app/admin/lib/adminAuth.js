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

export async function refreshAdminAccessToken(options = {}) {
  const refreshToken = getAdminRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_URL}/api/admin/staff/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: options.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.access_token) return null;
    setAdminTokens({ accessToken: data.access_token });
    return data.access_token;
  } catch {
    return null;
  }
}

let redirectingToSignIn = false;

function expireAdminSession() {
  if (typeof window === 'undefined' || redirectingToSignIn) return;
  // Only when signed in before (a missing token is the sign-in page's normal state).
  if (!getAdminAccessToken() && !getAdminRefreshToken()) return;
  clearAdminTokens();
  if (window.location.pathname.replace(/\/+$/, '') === '/admin') return;
  redirectingToSignIn = true;
  window.location.replace('/admin?expired=1');
}

// Admin access tokens are JWTs with an expiry: check it locally so an expired session never
// sends a burst of doomed requests (each would show up as a 401 in the system log).
function isTokenExpired(token, skewMs = 15000) {
  try {
    const part = token.split('.')[1];
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')));
    return typeof json.exp === 'number' && json.exp * 1000 <= Date.now() + skewMs;
  } catch {
    return false; // Not a JWT we can read: let the server decide.
  }
}

// Background checks often fire together; they share one refresh instead of each trying.
let refreshInFlight = null;
function refreshOnce(signal) {
  if (!refreshInFlight) {
    refreshInFlight = refreshAdminAccessToken({ signal }).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

const sessionExpiredResponse = () =>
  new Response(JSON.stringify({ detail: 'Session expired' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

export async function adminFetch(url, options = {}) {
  if (redirectingToSignIn) return sessionExpiredResponse();
  let accessToken = getAdminAccessToken();
  if (accessToken && isTokenExpired(accessToken)) {
    accessToken = await refreshOnce(options.signal);
    if (!accessToken) {
      expireAdminSession();
      return sessionExpiredResponse();
    }
  }
  const headers = { ...(options.headers || {}) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const first = await fetch(url, { ...options, headers });
  if (first.status !== 401) return first;

  const refreshed = await refreshOnce(options.signal);
  if (!refreshed) {
    // The session can't be renewed: sign out and go to sign-in once, rather than letting every
    // background check (inbox, notifications...) keep failing and filling the system log.
    expireAdminSession();
    return first;
  }

  const headers2 = { ...(options.headers || {}), Authorization: `Bearer ${refreshed}` };
  return fetch(url, { ...options, headers: headers2 });
}
