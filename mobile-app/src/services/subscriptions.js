import { API_BASE_URL } from '../utils/constants';

const withAuth = (token) => ({
  Authorization: `Bearer ${token}`,
});

export const fetchSubscription = async (token) => {
  const response = await fetch(`${API_BASE_URL}/subscriptions/me`, {
    headers: withAuth(token),
  });
  return response.json();
};

export const startCheckout = async (token) => {
  const response = await fetch(`${API_BASE_URL}/subscriptions/checkout`, {
    method: 'POST',
    headers: withAuth(token),
  });
  return response.json();
};
