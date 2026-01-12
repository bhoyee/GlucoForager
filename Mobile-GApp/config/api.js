// config/api.js
import { Platform } from 'react-native';

const DEV_DEFAULT_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';
const PROD_DEFAULT_URL = 'https://your-production-api.com';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? DEV_DEFAULT_URL : PROD_DEFAULT_URL);

export const API_ENDPOINTS = {
  SIGNUP: '/api/auth/signup',
  LOGIN: '/api/auth/login',
  FORGOT_PASSWORD: '/api/auth/forgot-password',
  RESET_PASSWORD: '/api/auth/reset-password',
  RECIPE_SUGGESTIONS: '/api/recipes/suggestions',
  RECENT_RECIPES: '/api/recipes/recent',
  RECIPE_DETAIL: '/api/recipes',
  SCANS_TODAY: '/api/user/scans-today',
  AI_VISION_RECIPES: '/api/ai/recipes/vision',
  AI_VISION_RECIPES_BATCH: '/api/ai/recipes/vision-batch',
  AI_TEXT_RECIPES: '/api/ai/text/recipes',
  USER_STATS: '/api/user/stats',
  CAN_SCAN: '/api/user/can-scan',
  RECORD_SCAN: '/api/user/record-scan',
  UPGRADE: '/api/user/upgrade',
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
