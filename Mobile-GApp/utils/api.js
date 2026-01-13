export const apiFetch = async (url, options = {}, { onUnauthorized } = {}) => {
  const response = await fetch(url, options);
  if (response.status === 401 && onUnauthorized) {
    await onUnauthorized();
  }
  return response;
};
