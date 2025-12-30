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
  return response.json();
};

export const generateVisionRecipes = async (imageBase64, token, filters = []) => {
  const response = await fetch(`${API_BASE_URL}/ai/recipes/vision`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ image_base64: imageBase64, filters }),
  });
  return response.json();
};
