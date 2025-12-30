import React, { createContext, useContext, useState } from 'react';

const SubscriptionContext = createContext(null);

export const SubscriptionProvider = ({ children }) => {
  const [tier, setTier] = useState('free');
  const [scansToday, setScansToday] = useState(0);

  const upgrade = () => setTier('premium');
  const downgrade = () => setTier('free');
  const incrementScan = () => setScansToday((prev) => prev + 1);
  const resetScans = () => setScansToday(0);

  return (
    <SubscriptionContext.Provider
      value={{ tier, isPremium: tier === 'premium', scansToday, incrementScan, resetScans, upgrade, downgrade }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => useContext(SubscriptionContext);
