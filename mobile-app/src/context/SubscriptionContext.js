import React, { createContext, useContext, useState } from 'react';

const SubscriptionContext = createContext(null);

export const SubscriptionProvider = ({ children }) => {
  const [tier, setTier] = useState('free');

  const upgrade = () => setTier('premium');
  const downgrade = () => setTier('free');

  return (
    <SubscriptionContext.Provider value={{ tier, isPremium: tier === 'premium', upgrade, downgrade }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => useContext(SubscriptionContext);
