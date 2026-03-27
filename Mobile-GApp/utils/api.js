import { addDebugLog } from './debugLogger';
import { Alert } from 'react-native';

let authRefreshHandler = null;
let lastRateLimitAlertAt = 0;
const RATE_LIMIT_ALERT_COOLDOWN_MS = 15000;

export const setAuthRefreshHandler = (handler) => {
  authRefreshHandler = handler;
};

const shouldSuppressFailureDebugLog = (url) => {
  const u = String(url || '');
  // Avoid feedback loops: mobile log upload failures would generate more logs.
  if (u.includes('/api/mobile/logs')) return true;
  return false;
};

const shouldShowRateLimitAlert = (url) => {
  const u = String(url || '');
  // Never show popups for background / silent endpoints.
  if (u.includes('/api/mobile/logs')) return false;
  return true;
};

const maybeShowRateLimitAlert = (url, response) => {
  if (!shouldShowRateLimitAlert(url)) return;
  const now = Date.now();
  if (now - lastRateLimitAlertAt < RATE_LIMIT_ALERT_COOLDOWN_MS) return;
  lastRateLimitAlertAt = now;

  const retryAfterRaw = response?.headers?.get?.('Retry-After');
  const retryAfterSeconds = retryAfterRaw ? Number.parseInt(retryAfterRaw, 10) : null;
  const waitText =
    Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? `Please wait ${retryAfterSeconds} seconds and try again.`
      : 'Please wait a moment and try again.';

  Alert.alert(
    'Please slow down',
    `You’ve made too many requests in a short time. ${waitText}`
  );
};

const buildNetworkErrorResponse = (url, error) => {
  const name = String(error?.name || '');
  const msg = String(error?.message || error || '');
  const isAbort = name === 'AbortError' || msg.toLowerCase().includes('aborted');
  const detail = isAbort
    ? 'Request timed out. Please try again.'
    : 'Network request failed. Please check your connection.';

  return {
  ok: false,
  status: 0,
  statusText: isAbort ? 'Request timed out' : 'Network request failed',
  url,
  headers: new Headers(),
  error,
  json: async () => ({ detail }),
  text: async () => detail,
};
};

const withSafeBodyParsing = (response) => {
  let cachedJson;
  let cachedText;

  response.json = async () => {
    if (cachedJson !== undefined) return cachedJson;
    try {
      const clone = response.clone();
      cachedJson = await clone.json();
      return cachedJson;
    } catch (error) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        cachedJson = { detail: text };
        return cachedJson;
      } catch (readError) {
        cachedJson = { detail: 'Request failed.' };
        return cachedJson;
      }
    }
  };

  response.text = async () => {
    if (cachedText !== undefined) return cachedText;
    try {
      const clone = response.clone();
      cachedText = await clone.text();
      return cachedText;
    } catch (error) {
      cachedText = '';
      return cachedText;
    }
  };

  return response;
};

export const apiFetch = async (
  url,
  options = {},
  { onUnauthorized, timeoutMs = 10000 } = {}
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const { _retry, ...fetchOptions } = options;
  const startedAt = Date.now();

  if (options.signal) {
    options.signal.addEventListener(
      'abort',
      () => controller.abort(),
      { once: true }
    );
  }

  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    const safeResponse = withSafeBodyParsing(response);
    if (response.status === 401 && authRefreshHandler && !_retry) {
      const newToken = await authRefreshHandler();
      if (newToken) {
        const nextHeaders = { ...(fetchOptions.headers || {}) };
        if (nextHeaders.Authorization) {
          nextHeaders.Authorization = `Bearer ${newToken}`;
        }
        return await apiFetch(
          url,
          { ...fetchOptions, headers: nextHeaders, _retry: true },
          { onUnauthorized, timeoutMs }
        );
      }
    }
    if (response.status === 401 && onUnauthorized) {
      await onUnauthorized();
    }
    if (response.status === 429) {
      maybeShowRateLimitAlert(url, response);
      const retryAfter = response.headers.get('Retry-After');
      addDebugLog({
        source: 'API',
        level: 'warn',
        message: 'Rate limit reached (429)',
        details: retryAfter ? `${url} | Retry-After: ${retryAfter}s` : url,
      });
    }
    if (!response.ok) {
      if (!shouldSuppressFailureDebugLog(url) && response.status !== 429) {
        let detailText = url;
        try {
          const body = await safeResponse.json();
          const traceId =
            safeResponse?.headers?.get?.('X-Swaps-Trace-Id') ||
            safeResponse?.headers?.get?.('x-swaps-trace-id') ||
            null;
          const code = body?.detail?.code || null;
          const msg = body?.detail?.message || body?.detail || null;
          const ms = Date.now() - startedAt;
          const extraBits = [];
          if (code) extraBits.push(`code=${code}`);
          if (traceId) extraBits.push(`trace=${traceId}`);
          extraBits.push(`ms=${ms}`);
          const extra = extraBits.length ? ` | ${extraBits.join(' ')}` : '';
          detailText = msg ? `${url} | ${String(msg).slice(0, 160)}${extra}` : `${url}${extra}`;
        } catch (e) {
          const ms = Date.now() - startedAt;
          detailText = `${url} | ms=${ms}`;
        }
        addDebugLog({
          source: 'API',
          level: 'warn',
          message: `Request failed (${response.status})`,
          details: detailText,
        });
      }
    }
    return safeResponse;
  } catch (error) {
    const ms = Date.now() - startedAt;
    addDebugLog({
      source: 'API',
      level: 'error',
      message: 'Network request failed.',
      details: `${url} | ${error?.message || error} | ms=${ms} timeoutMs=${timeoutMs}`,
    });
    return buildNetworkErrorResponse(url, error);
  } finally {
    clearTimeout(timeoutId);
  }
};
