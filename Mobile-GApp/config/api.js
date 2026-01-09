// config/api.js
// For now, we'll use mock data. In production, replace with your actual API URL
export const API_URL = __DEV__ 
  ? 'https://your-dev-api.com' // Development API
  : 'https://your-production-api.com'; // Production API

export const API_ENDPOINTS = {
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