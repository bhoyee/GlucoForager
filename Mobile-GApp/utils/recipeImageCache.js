import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'recipe_image_cache_v1';
const MAX_ITEMS = 250;

const normalizeText = (value) => `${value || ''}`.trim().toLowerCase();

export const isPlaceholderRecipeImageUrl = (url) => {
  const value = typeof url === 'string' ? url.trim().toLowerCase() : '';
  if (!value) return false;
  return (
    value.includes('placeholder') ||
    value.includes('/uploads/placeholders/') ||
    value.includes('photo-1504674900247-0877df9cc836')
  );
};

const normalizeIngredientForFingerprint = (value) => {
  const text = normalizeText(value);
  if (!text) return '';
  // Strip leading quantities/units to keep keys stable across formatting.
  // Examples: "2 eggs" -> "eggs", "1/2 cup spinach" -> "spinach"
  return text
    .replace(/^\s*(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*(x|×)?\s*/i, '')
    .replace(
      /^\s*(cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|g|kg|mg|ml|l|oz|lb|lbs|pound|pounds)\b\s*/i,
      ''
    )
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const recipeFingerprint = (recipe) => {
  if (!recipe || typeof recipe !== 'object') return null;
  const title = normalizeText(recipe.title || recipe.name || '');
  const rawIngredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const names = rawIngredients
    .map((item) => (typeof item === 'string' ? item : item?.name || item?.title))
    .filter(Boolean)
    .map((item) => normalizeIngredientForFingerprint(item))
    .filter(Boolean);
  names.sort();
  const normalized = Array.from(new Set(names)).join(',');
  if (!title && !normalized) return null;
  return `${title}|${normalized}`;
};

const hashString = (input) => {
  // Simple deterministic hash (djb2) to keep key short.
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

const loadCache = async () => {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const saveCache = async (cache) => {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage errors.
  }
};

export const getCachedRecipeImageUrl = async (recipe) => {
  const fp = recipeFingerprint(recipe);
  if (!fp) return null;
  const key = hashString(fp);
  const cache = await loadCache();
  const value = cache?.[key];
  if (typeof value?.url === 'string' && value.url.trim() && !isPlaceholderRecipeImageUrl(value.url)) {
    return value.url.trim();
  }
  return null;
};

export const setCachedRecipeImageUrl = async (recipe, url) => {
  const fp = recipeFingerprint(recipe);
  if (!fp) return;
  const cleanUrl = typeof url === 'string' ? url.trim() : '';
  if (!cleanUrl || isPlaceholderRecipeImageUrl(cleanUrl)) return;

  const key = hashString(fp);
  const cache = await loadCache();

  cache[key] = { url: cleanUrl, ts: Date.now() };

  // Trim oldest entries to keep cache bounded.
  const entries = Object.entries(cache);
  if (entries.length > MAX_ITEMS) {
    entries.sort((a, b) => (a[1]?.ts || 0) - (b[1]?.ts || 0));
    const toDelete = entries.slice(0, Math.max(0, entries.length - MAX_ITEMS));
    toDelete.forEach(([k]) => {
      delete cache[k];
    });
  }

  await saveCache(cache);
};
