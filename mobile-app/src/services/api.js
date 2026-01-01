import { API_BASE_URL } from '../utils/constants';

const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

export const searchRecipes = async (ingredients, token) => {
  const response = await fetch(`${API_BASE_URL}/ai/text/recipes`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ ingredients }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || 'Search failed');
  }
  return data;
};

export const generateVisionRecipes = async (imageBase64, token, filters = []) => {
  const response = await fetch(`${API_BASE_URL}/ai/recipes/vision`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ image_base64: imageBase64, filters }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || 'Vision analysis failed');
  }
  return data;
};

export const fetchProfile = async (token) => {
  const res = await fetch(`${API_BASE_URL}/user/profile`, { headers: jsonHeaders(token) });
  return res.json();
};

export const fetchScansToday = async (token) => {
  const res = await fetch(`${API_BASE_URL}/user/scans-today`, { headers: jsonHeaders(token) });
  return res.json();
};

export const listFavorites = async (token) => {
  const res = await fetch(`${API_BASE_URL}/favorites`, { headers: jsonHeaders(token) });
  return res.json();
};

export const saveFavorite = async (title, recipe, token) => {
  const res = await fetch(`${API_BASE_URL}/favorites`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ title, recipe }),
  });
  return res.json();
};

export const fetchHistory = async (token) => {
  const res = await fetch(`${API_BASE_URL}/history/ai-requests`, { headers: jsonHeaders(token) });
  return res.json();
};

export const fetchMealPlans = async (token) => {
  const res = await fetch(`${API_BASE_URL}/meal-plans`, { headers: jsonHeaders(token) });
  return res.json();
};

export const createMealPlan = async (plan_date, recipes, token) => {
  const res = await fetch(`${API_BASE_URL}/meal-plans`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ plan_date, recipes }),
  });
  return res.json();
};

export const fetchShoppingList = async (token) => {
  const res = await fetch(`${API_BASE_URL}/shopping-list`, { headers: jsonHeaders(token) });
  return res.json();
};

export const createShoppingList = async (title, items, token) => {
  const res = await fetch(`${API_BASE_URL}/shopping-list`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ title, items }),
  });
  return res.json();
};
