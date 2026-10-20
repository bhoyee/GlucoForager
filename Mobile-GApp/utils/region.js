// utils/region.js
// The phone's region setting (e.g. "GB"), sent to the backend as one signal for the
// user's country; the backend also uses their usual IP country (services/geo_country.py).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';
import { API_URL } from '../config/api';
import { countries } from './countries';

export function getPhoneRegion() {
  try {
    // Loaded lazily so an older app build without the native module still works.
    // eslint-disable-next-line global-require
    const Localization = require('expo-localization');
    const code = Localization?.getLocales?.()?.[0]?.regionCode;
    if (typeof code === 'string' && /^[A-Za-z]{2}$/.test(code)) return code.toUpperCase();
  } catch {
    // Fall through to Intl.
  }
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    const match = locale.match(/[-_]([A-Za-z]{2})\b/);
    return match ? match[1].toUpperCase() : null;
  } catch {
    return null;
  }
}

export const countryName = (code) => countries.find((c) => c.code === String(code || '').toUpperCase())?.name || null;

async function post(path, body) {
  const token = await AsyncStorage.getItem('userToken');
  if (!token) return null;
  const res = await apiFetch(
    `${API_URL}${path}`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    { timeoutMs: 8000 }
  );
  return res.ok ? res.json() : null;
}

/** Called when Home opens. Returns { country_code, source, ask, suggested_country }. */
export const reportRegion = () => post('/api/app/me/region', { phone_region: getPhoneRegion() });

/** The country card's answer: 'confirm' | 'set' (with a code) | 'snooze'. */
export const answerCountry = (action, countryCode) =>
  post('/api/app/me/country', { action, ...(countryCode ? { country_code: countryCode } : {}) });
