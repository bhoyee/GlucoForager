// config/api.js
import { Platform } from 'react-native';

// Local dev tip:
// - Android emulator: http://10.0.2.2:8010
// - iOS simulator: http://localhost:8010
// - Physical device: use your machine LAN IP, e.g. http://192.168.x.x:8010
const DEV_DEFAULT_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:8010' : 'http://localhost:8010';
const PROD_DEFAULT_URL = 'https://api.glucoforager.com';
const envApiUrl = process.env.EXPO_PUBLIC_API_URL;
const resolvedApiUrl = envApiUrl || (__DEV__ ? DEV_DEFAULT_URL : PROD_DEFAULT_URL);

export const API_URL = __DEV__ ? resolvedApiUrl.replace(/:8011\b/, ':8010') : resolvedApiUrl;

export const API_ENDPOINTS = {
  SIGNUP: '/api/auth/signup',
  LOGIN: '/api/auth/login',
  REFRESH: '/api/auth/refresh',
  LOGOUT: '/api/auth/logout',
  FORGOT_PASSWORD: '/api/auth/forgot-password',
  RESET_PASSWORD: '/api/auth/reset-password',
  RECIPE_SUGGESTIONS: '/api/recipes/suggestions',
  RECENT_RECIPES: '/api/recipes/recent',
  RECIPE_HISTORY: '/api/recipes/history',
  RECIPE_DETAIL: '/api/recipes',
  SCANS_TODAY: '/api/user/scans-today',
  AI_VISION_RECIPES: '/api/ai/recipes/vision',
  AI_VISION_RECIPES_BATCH: '/api/ai/recipes/vision-batch',
  AI_VISION_RECIPES_ASYNC: '/api/ai/recipes/vision/async',
  AI_VISION_RECIPES_BATCH_ASYNC: '/api/ai/recipes/vision-batch/async',
  AI_VISION_RECIPES_ASYNC_STATUS: '/api/ai/recipes/vision/async',
  AI_TEXT_RECIPES: '/api/ai/text/recipes',
  AI_TEXT_RECIPES_ASYNC: '/api/ai/text/recipes/async',
  AI_TEXT_RECIPES_ASYNC_STATUS: '/api/ai/text/recipes/async',
  AI_RECIPES_IMAGE: '/api/ai/recipes/image',
  FAVORITES: '/api/favorites',
  USER_STATS: '/api/user/stats',
  USER_PROFILE: '/api/user/profile',
  USER_LAST_INGREDIENTS: '/api/user/last-ingredients',
  USER_DELETE_ACCOUNT: '/api/user/account',
  SUBSCRIPTION_UPGRADE: '/api/subscriptions/upgrade',
  CAN_SCAN: '/api/user/can-scan',
  RECORD_SCAN: '/api/user/record-scan',
  UPGRADE: '/api/user/upgrade',
  MOBILE_PUSH_TOKENS: '/api/mobile/push-tokens',
  MOBILE_PUSH_TOKENS_DISABLE: '/api/mobile/push-tokens/disable',
  DAILY_PLAN_TODAY: '/api/app/daily-plan/today',
  DAILY_PLAN_BY_DATE: '/api/app/daily-plan/date',
  DAILY_PLAN_GENERATE: '/api/app/daily-plan/generate',
  AGENT_CHAT: '/api/agent/chat',
  AGENT_CHAT_STREAM: '/api/agent/chat/stream',
};

// For development/testing without a backend, use mock functions
export const mockApi = {
  getUserStats: async (token) => {
    // Mock response - replace with actual API call
    return {
      isPremium: false,
      name: "Test User",
      todayScans: 0,
      remainingScans: 3,
    };
  },
  
  canUserScan: async (token) => {
    // Mock response
    return { canScan: true };
  },
  
  recordScan: async (token) => {
    // Mock response
    return { success: true };
  },
};
