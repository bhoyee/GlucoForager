// Weekly free AI uses for users without Premium.
//
// The backend returns `free_usage` on /api/user/scans-today and /api/user/profile when the
// user has no Premium/trial/welcome-week access (null means unlimited):
//   { resets_at, features: { glucoguide: { limit, used, remaining }, ... } }
// When a free user runs out, AI endpoints answer 402 with detail.code "free_limit_reached".

import { Alert } from 'react-native';

export const FREE_FEATURES = {
  GLUCOGUIDE: 'glucoguide',
  INGREDIENT_SCAN: 'ingredient_scan',
  RECIPE_GENERATION: 'recipe_generation',
  FOOD_SCAN: 'food_scan',
  SWAPS: 'swaps',
};

const LABELS = {
  glucoguide: ['free question', 'free questions'],
  ingredient_scan: ['free scan', 'free scans'],
  recipe_generation: ['free recipe generation', 'free recipe generations'],
  food_scan: ['free food scan', 'free food scans'],
  swaps: ['free swap search', 'free swap searches'],
};

// Returns { limit, used, remaining } for a free user, or null when usage is unlimited/unknown.
export const getFreeUsage = (accessData, feature) => {
  const usage = accessData?.free_usage?.features?.[feature];
  if (!usage || typeof usage.limit !== 'number') return null;
  return {
    limit: usage.limit,
    used: Number(usage.used) || 0,
    remaining: Math.max(0, Number(usage.remaining) || 0),
  };
};

export const hasFreeUsesLeft = (accessData, feature) => (getFreeUsage(accessData, feature)?.remaining || 0) > 0;

// "2 of 3 free scans left this week"
export const freeUsesLabel = (usage, feature) => {
  if (!usage) return null;
  const [singular, plural] = LABELS[feature] || ['free use', 'free uses'];
  if (usage.remaining <= 0) return `No ${plural} left this week · more on Monday`;
  return `${usage.remaining} of ${usage.limit} ${usage.limit === 1 ? singular : plural} left this week`;
};

export const isFreeLimitDetail = (detail) =>
  Boolean(detail && typeof detail === 'object' && ['free_limit_reached', 'premium_feature'].includes(detail.code));

export const showFreeLimitAlert = (detail, onUpgrade) => {
  Alert.alert(
    detail?.code === 'premium_feature' ? 'Premium feature' : "You've used this week's free uses",
    detail?.message || 'Upgrade to Premium for unlimited access, or come back on Monday for more free uses.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Upgrade', onPress: onUpgrade },
    ]
  );
};
