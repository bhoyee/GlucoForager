import { Platform } from 'react-native';

const REVENUECAT_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS;
const REVENUECAT_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;

// Optional: force the app to present a specific RevenueCat offering instead of relying on the "current" offering.
// Defaults to "sale" because that's what we currently use in RevenueCat.
export const REVENUECAT_OFFERING_ID = process.env.EXPO_PUBLIC_REVENUECAT_OFFERING_ID || 'sale';

export const REVENUECAT_API_KEY =
  Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;
export const REVENUECAT_ENTITLEMENT = 'glucoforager Premium';
