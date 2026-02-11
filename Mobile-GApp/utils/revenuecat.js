import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import PurchasesUI from 'react-native-purchases-ui';
import { REVENUECAT_API_KEY, REVENUECAT_ENTITLEMENT, REVENUECAT_OFFERING_ID } from '../config/revenuecat';
import { addDebugLog } from './debugLogger';

let configured = false;
let currentUserId = null;
let hasLoggedInUser = false;
let missingKeyLogged = false;
const isAnonymousId = (value) => {
  if (!value) return true;
  return `${value}`.startsWith('$RCAnonymousID');
};

export const configureRevenueCat = async ({ token, publicId, email, fullName } = {}) => {
  if (!REVENUECAT_API_KEY) {
    if (!missingKeyLogged) {
      addDebugLog({ source: 'RevenueCat', level: 'warn', message: 'Missing RevenueCat API key.' });
      missingKeyLogged = true;
    }
    return;
  }

  if (!configured) {
    Purchases.setDebugLogsEnabled(false);
    Purchases.configure({ apiKey: REVENUECAT_API_KEY });
    addDebugLog({
      source: 'RevenueCat',
      level: 'info',
      message: 'RevenueCat configured.',
      details: `platform=${Platform.OS} key_prefix=${String(REVENUECAT_API_KEY).slice(0, 5)}`,
    });
    configured = true;
  }

  const userId = publicId || null;
  if (userId && userId !== currentUserId) {
    try {
      await Purchases.logIn(userId);
      currentUserId = userId;
      hasLoggedInUser = true;
    } catch (error) {
      addDebugLog({
        source: 'RevenueCat',
        level: 'error',
        message: 'RevenueCat login failed.',
        details: `${error?.message || error}`,
      });
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
      addDebugLog({
        source: 'RevenueCat',
        level: 'error',
        message: 'RevenueCat attribute sync failed.',
        details: `${error?.message || error}`,
      });
      // Ignore attribute errors.
    }
  }

  if (!userId) {
    if (!hasLoggedInUser) {
      currentUserId = null;
      return;
    }
    try {
      const info = await Purchases.getCustomerInfo();
      const originalId = info?.originalAppUserId || '';
      if (!isAnonymousId(originalId) && originalId === currentUserId) {
        await Purchases.logOut();
      }
    } catch (error) {
      addDebugLog({
        source: 'RevenueCat',
        level: 'error',
        message: 'RevenueCat logout failed.',
        details: `${error?.message || error}`,
      });
      // Ignore logout errors.
    } finally {
      currentUserId = null;
      hasLoggedInUser = false;
    }
  }
};

export const isRevenueCatConfigured = () => Boolean(REVENUECAT_API_KEY);

export const presentPaywall = async ({ offeringId = REVENUECAT_OFFERING_ID } = {}) => {
  try {
    let selectedOffering = null;

    if (offeringId) {
      try {
        const offerings = await Purchases.getOfferings();
        selectedOffering = offerings?.all?.[offeringId] || null;
        if (!selectedOffering) {
          addDebugLog({
            source: 'RevenueCat',
            level: 'warn',
            message: `Offering "${offeringId}" not found; using current offering instead.`,
          });
        }
      } catch (error) {
        addDebugLog({
          source: 'RevenueCat',
          level: 'warn',
          message: 'Unable to resolve offering before presenting paywall; using current offering instead.',
          details: `${error?.message || error}`,
        });
      }
    }

    return await PurchasesUI.presentPaywall(selectedOffering ? { offering: selectedOffering } : {});
  } catch (error) {
    addDebugLog({
      source: 'RevenueCat',
      level: 'error',
      message: 'Paywall failed to open.',
      details: `${error?.message || error}`,
    });
    throw error;
  }
};

export const getOfferings = async () => {
  try {
    const offerings = await Purchases.getOfferings();
    const hasCurrent = Boolean(offerings?.current);
    const hasAny =
      offerings &&
      typeof offerings === 'object' &&
      Object.keys(offerings?.all || {}).length > 0;
    if (!hasCurrent && !hasAny) {
      addDebugLog({
        source: 'RevenueCat',
        level: 'warn',
        message: 'Offerings are empty.',
      });
    }
    return offerings;
  } catch (error) {
    addDebugLog({
      source: 'RevenueCat',
      level: 'error',
      message: 'Failed to fetch offerings.',
      details: `${error?.message || error}`,
    });
    throw error;
  }
};

export const presentCustomerCenter = async () => {
  try {
    return await PurchasesUI.presentCustomerCenter();
  } catch (error) {
    addDebugLog({
      source: 'RevenueCat',
      level: 'error',
      message: 'Customer Center failed to open.',
      details: `${error?.message || error}`,
    });
    throw error;
  }
};

export const getCustomerInfo = async () => {
  try {
    return await Purchases.getCustomerInfo();
  } catch (error) {
    addDebugLog({
      source: 'RevenueCat',
      level: 'error',
      message: 'Failed to fetch customer info.',
      details: `${error?.message || error}`,
    });
    throw error;
  }
};

export const isPremiumEntitled = (customerInfo) => {
  return Boolean(customerInfo?.entitlements?.active?.[REVENUECAT_ENTITLEMENT]);
};
