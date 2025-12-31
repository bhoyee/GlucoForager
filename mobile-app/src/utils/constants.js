// Use LAN IP so physical devices can reach the backend
export const API_BASE_URL = 'http://192.168.1.125:8010/api';

export const SUBSCRIPTION_PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 'GBP 0',
    features: ['3 searches/day', 'Text ingredient input', 'Banner ads'],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 'GBP 2.99/month',
    features: ['Unlimited searches', 'Camera ingredient recognition', 'Favorites', 'Ad-free'],
  },
];

export const TIER_LIMITS = {
  free: 3,
  premium: Infinity,
};
