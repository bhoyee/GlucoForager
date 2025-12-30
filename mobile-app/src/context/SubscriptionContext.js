import React, { createContext, useContext, useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { useAuth } from './AuthContext';
import { initRevenueCat, refreshEntitlements, purchasePremium, restorePurchases } from '../services/revenuecat';

const SubscriptionContext = createContext(null);

export const SubscriptionProvider = ({ children }) => {
  const [tier, setTier] = useState('free');
  const [scansToday, setScansToday] = useState(0);
   const [rcConfigured, setRcConfigured] = useState(false);
   const { user } = useAuth();

  const upgrade = () => setTier('premium');
  const downgrade = () => setTier('free');
  const incrementScan = () => setScansToday((prev) => prev + 1);
  const resetScans = () => setScansToday(0);

  useEffect(() => {
    (async () => {
      const init = await initRevenueCat(user?.email);
      setRcConfigured(init.configured);
      if (init.configured) {
        await syncEntitlements();
      }
    })();
  }, [user?.email]);

  const syncEntitlements = async () => {
    const res = await refreshEntitlements();
    if (res.isPremium) {
      setTier('premium');
    } else if (rcConfigured) {
      setTier('free');
    }
    return res.isPremium;
  };

  const purchase = async () => {
    const res = await purchasePremium();
    if (res.isPremium) {
      setTier('premium');
    } else if (res.error) {
      Alert.alert('Purchase failed', res.error);
    }
    return res;
  };

  const restore = async () => {
    const res = await restorePurchases();
    if (res.isPremium) {
      setTier('premium');
      Alert.alert('Restored', 'Premium access restored.');
    } else if (res.error) {
      Alert.alert('Restore failed', res.error);
    }
    return res;
  };

  return (
    <SubscriptionContext.Provider
      value={{
        tier,
        isPremium: tier === 'premium',
        scansToday,
        incrementScan,
        resetScans,
        upgrade,
        downgrade,
        rcConfigured,
        syncEntitlements,
        purchase,
        restore,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => useContext(SubscriptionContext);
