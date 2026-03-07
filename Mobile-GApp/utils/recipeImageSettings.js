import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config/api';
import { apiFetch } from './api';

const STORAGE_KEY = 'recipe_image_settings_v1';
const CACHE_MS = 10 * 60 * 1000;

const fallbackSettings = {
  enabled: true,
  size: 512,
  free_daily_limit: 1,
  premium_daily_limit: 10,
  max_per_recipe: 1,
};

const readCache = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeCache = async (payload) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore.
  }
};

export const getRecipeImageSettings = async ({ force = false } = {}) => {
  const cached = await readCache();
  const now = Date.now();
  if (!force && cached?.fetched_at && now - cached.fetched_at < CACHE_MS && cached?.settings) {
    return cached.settings;
  }

  if (!API_URL) {
    return cached?.settings || fallbackSettings;
  }

  try {
    const res = await apiFetch(`${API_URL}/api/app/update`, {}, { timeoutMs: 8000 });
    if (!res.ok) {
      return cached?.settings || fallbackSettings;
    }
    const data = await res.json().catch(() => ({}));
    const settings = data?.recipe_images || null;
    const normalized = {
      enabled: Boolean(settings?.enabled),
      size: Number(settings?.size) || 512,
      free_daily_limit: Number(settings?.free_daily_limit) ?? 1,
      premium_daily_limit: Number(settings?.premium_daily_limit) ?? 10,
      max_per_recipe: Number(settings?.max_per_recipe) ?? 1,
    };
    await writeCache({ fetched_at: now, settings: normalized });
    return normalized;
  } catch {
    return cached?.settings || fallbackSettings;
  }
};

