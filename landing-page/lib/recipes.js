// Shared helpers for the public recipe pages (/recipes and /recipes/[slug]).

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
export const API_BASE = API_URL.replace(/\/+$/, '');
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.glucoforager.com').replace(/\/+$/, '');

export const REVALIDATE_SECONDS = 600;

export const MEAL_FILTERS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snacks' },
];

export const QUICK_FILTERS = [
  { value: 'low_carb', label: 'Low carb (≤30g)' },
  { value: 'under_20', label: 'Under 20 min' },
  { value: 'high_protein', label: 'High protein' },
  { value: 'vegetarian', label: 'Vegetarian' },
];

export const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

export async function fetchRecipeList({ meal, quick, page = 1, pageSize = 24 } = {}) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (meal) params.set('meal_type', meal);
  if (quick) params.set('quick', quick);
  const res = await fetch(`${API_BASE}/api/public/recipes?${params}`, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!res.ok) throw new Error(`recipes ${res.status}`);
  return res.json();
}

export async function fetchRecipe(slug) {
  const res = await fetch(`${API_BASE}/api/public/recipes/${encodeURIComponent(slug)}`, {
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`recipe ${res.status}`);
  return res.json();
}

export function resolveImage(url) {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${API_BASE}/${value.replace(/^\/+/, '')}`;
}

const FRACTIONS = { 0.25: '¼', 0.33: '⅓', 0.5: '½', 0.67: '⅔', 0.75: '¾' };

export function formatQuantity(quantity) {
  const n = Number(quantity);
  if (!Number.isFinite(n) || n <= 0) return quantity ? String(quantity) : '';
  const whole = Math.floor(n);
  const frac = FRACTIONS[Math.round((n - whole) * 100) / 100];
  if (frac) return whole ? `${whole}${frac}` : frac;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

export function ingredientText(item) {
  const parts = [formatQuantity(item.quantity), item.unit, item.name].filter(Boolean);
  return parts.join(' ') + (item.note ? ` (${item.note})` : '');
}

export const round = (value) => (value == null ? null : Math.round(Number(value)));

export function minutesLabel(total) {
  if (!total) return null;
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const isoDuration = (minutes) => (minutes ? `PT${Math.round(minutes)}M` : undefined);

export function recipesHref({ meal, quick, page } = {}) {
  const params = new URLSearchParams();
  if (meal) params.set('meal', meal);
  if (quick) params.set('quick', quick);
  if (page && page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/recipes?${qs}` : '/recipes';
}
