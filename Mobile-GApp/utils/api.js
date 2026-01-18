export const apiFetch = async (
  url,
  options = {},
  { onUnauthorized, timeoutMs = 10000 } = {}
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (response.status === 401 && onUnauthorized) {
      await onUnauthorized();
    }
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};
