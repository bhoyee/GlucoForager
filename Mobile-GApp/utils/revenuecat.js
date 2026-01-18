import Purchases from 'react-native-purchases';
import PurchasesUI from 'react-native-purchases-ui';
import { REVENUECAT_API_KEY, REVENUECAT_ENTITLEMENT } from '../config/revenuecat';

let configured = false;
let currentUserId = null;

export const configureRevenueCat = async ({ token, publicId, email, fullName } = {}) => {
  if (!REVENUECAT_API_KEY) {
    return;
  }

  if (!configured) {
    Purchases.setDebugLogsEnabled(false);
    Purchases.configure({ apiKey: REVENUECAT_API_KEY });
    configured = true;
  }

  const userId = publicId || null;
  if (userId && userId !== currentUserId) {
    try {
      await Purchases.logIn(userId);
      currentUserId = userId;
    } catch (error) {
      // Ignore login errors; keep anonymous user.
    }
  }

  if (userId && (email || fullName)) {
    try {
      await Purchases.setAttributes({
        ...(email ? { $email: email } : {}),
        ...(fullName ? { $displayName: fullName } : {}),
      });
    } catch (error) {
      // Ignore attribute errors.
    }
  }

  if (!userId && currentUserId) {
    try {
      const info = await Purchases.getCustomerInfo();
      const originalId = info?.originalAppUserId || '';
      if (originalId && !originalId.startsWith('$RCAnonymousID')) {
        await Purchases.logOut();
      }
    } catch (error) {
      // Ignore logout errors.
    } finally {
      currentUserId = null;
    }
  }
};

export const presentPaywall = async () => {
  return PurchasesUI.presentPaywall();
};

export const presentCustomerCenter = async () => {
  return PurchasesUI.presentCustomerCenter();
};

export const getCustomerInfo = async () => Purchases.getCustomerInfo();

export const isPremiumEntitled = (customerInfo) => {
  return Boolean(customerInfo?.entitlements?.active?.[REVENUECAT_ENTITLEMENT]);
};
