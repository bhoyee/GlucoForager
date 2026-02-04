import { addDebugLog } from './debugLogger';

const buildNetworkErrorResponse = (url, error) => ({
  ok: false,
  status: 0,
  statusText: 'Network request failed',
  url,
  headers: new Headers(),
  error,
  json: async () => ({ detail: 'Network request failed. Please check your connection.' }),
  text: async () => 'Network request failed. Please check your connection.',
});

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

  if (options.signal) {
    options.signal.addEventListener(
      'abort',
      () => controller.abort(),
      { once: true }
    );
  }

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (response.status === 401 && onUnauthorized) {
      await onUnauthorized();
    }
    if (!response.ok) {
      addDebugLog({
        source: 'API',
        level: 'warn',
        message: `Request failed (${response.status})`,
        details: url,
      });
    }
    return withSafeBodyParsing(response);
  } catch (error) {
    addDebugLog({
      source: 'API',
      level: 'error',
      message: 'Network request failed.',
      details: `${url} | ${error?.message || error}`,
    });
    return buildNetworkErrorResponse(url, error);
  } finally {
    clearTimeout(timeoutId);
  }
};
