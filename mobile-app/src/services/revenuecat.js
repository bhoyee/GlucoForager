import Purchases from 'react-native-purchases';
import { Platform } from 'react-native';

const IOS_API_KEY = 'appl_YOUR_REVENUECAT_API_KEY';
const ANDROID_API_KEY = 'goog_YOUR_REVENUECAT_API_KEY';
const ENTITLEMENT_ID = 'premium';

let configured = false;

export const initRevenueCat = async (appUserId) => {
  try {
    const apiKey = Platform.OS === 'ios' ? IOS_API_KEY : ANDROID_API_KEY;
    if (!apiKey || apiKey.includes('YOUR_REVENUECAT')) {
      return { configured: false, reason: 'Missing RevenueCat API key' };
    }
    await Purchases.configure({ apiKey, appUserID: appUserId || null });
    configured = true;
    return { configured: true };
  } catch (e) {
    return { configured: false, error: e.message };
  }
};

export const refreshEntitlements = async () => {
  if (!configured) return { configured: false, isPremium: false };
  const info = await Purchases.getCustomerInfo();
  const active = info.entitlements.active;
  const isPremium = !!active[ENTITLEMENT_ID];
  return { configured: true, isPremium, info };
};

export const purchasePremium = async () => {
  if (!configured) return { configured: false, isPremium: false, error: 'Not configured' };
  const offerings = await Purchases.getOfferings();
  const offering = offerings.current;
  if (!offering || !offering.availablePackages.length) {
    return { configured: true, isPremium: false, error: 'No packages available' };
  }
  const pkg = offering.availablePackages[0];
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  const isPremium = !!customerInfo.entitlements.active[ENTITLEMENT_ID];
  return { configured: true, isPremium };
};

export const restorePurchases = async () => {
  if (!configured) return { configured: false, isPremium: false, error: 'Not configured' };
  const info = await Purchases.restorePurchases();
  const isPremium = !!info.entitlements.active[ENTITLEMENT_ID];
  return { configured: true, isPremium };
};
