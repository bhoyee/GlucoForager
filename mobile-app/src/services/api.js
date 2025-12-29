import { API_BASE_URL } from '../utils/constants';

const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

export const searchRecipes = async (ingredients, token) => {
  const response = await fetch(`${API_BASE_URL}/recipes/search`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ ingredients }),
  });
  return response.json();
};
