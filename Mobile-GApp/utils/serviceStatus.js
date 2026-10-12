// Service status (outage banner) support.
//
// Reads https://glucoforager-status.glucoforager.workers.dev/status, a Cloudflare
// Worker that health-checks the API every minute. It runs independently of the
// backend server, so the app can still learn about an outage when the API itself
// is unreachable - including on the login screen, before anyone signs in.
//
// Deliberately uses plain fetch (not apiFetch) so this module never depends on the
// API being up and api.js can import it without a circular dependency.

const STATUS_URL =
  process.env.EXPO_PUBLIC_STATUS_URL || 'https://glucoforager-status.glucoforager.workers.dev/status';

const FETCH_TIMEOUT_MS = 6000;
// Don't hammer the status endpoint when many API calls fail at once.
const MIN_CHECK_INTERVAL_MS = 20000;

let current = { status: 'up', message: null, since: null };
let lastCheckAt = 0;
let inFlight = null;
const listeners = new Set();

const emit = () => {
  listeners.forEach((listener) => {
    try {
      listener(current);
    } catch {
      // Ignore listener errors.
    }
  });
};

export const getServiceStatus = () => current;

export const isServiceDisrupted = (s = current) => s?.status === 'down' || s?.status === 'maintenance';

export const subscribeServiceStatus = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const refreshServiceStatus = async ({ force = false } = {}) => {
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastCheckAt < MIN_CHECK_INTERVAL_MS) return current;

  inFlight = (async () => {
    lastCheckAt = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(STATUS_URL, { signal: controller.signal, headers: { 'Cache-Control': 'no-cache' } });
      if (!res.ok) return current;
      const body = await res.json();
      const next = {
        status: ['up', 'down', 'maintenance'].includes(body?.status) ? body.status : 'up',
        message: typeof body?.message === 'string' ? body.message : null,
        since: body?.since || null,
      };
      const changed = next.status !== current.status || next.message !== current.message;
      current = next;
      if (changed) emit();
      return current;
    } catch {
      // Status endpoint unreachable too (e.g. the phone is offline): keep the last
      // known status rather than guessing.
      return current;
    } finally {
      clearTimeout(timeoutId);
      inFlight = null;
    }
  })();
  return inFlight;
};

// Called by apiFetch when the API can't be reached or returns a gateway error.
export const reportApiUnreachable = () => {
  refreshServiceStatus();
};

// Called by apiFetch on a successful response; clears a stale banner quickly once
// the API is back, without waiting for the next poll.
export const reportApiReachable = () => {
  if (isServiceDisrupted()) refreshServiceStatus();
};
