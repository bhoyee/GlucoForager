import { API_BASE_URL } from '../utils/constants';

export const signup = async (email, password) => {
  const response = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return response.json();
};

export const login = async (email, password) => {
  const body = new URLSearchParams();
  body.append('username', email);
  body.append('password', password);
  const response = await fetch(`${API_BASE_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return response.json();
};
