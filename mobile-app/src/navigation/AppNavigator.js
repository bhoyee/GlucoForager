import React from 'react';
import { NavigationContainer } from '@react-navigation/native';

import { AuthProvider } from '../context/AuthContext';
import { SubscriptionProvider } from '../context/SubscriptionContext';
import AuthStack from './AuthStack';

const AppNavigator = () => (
  <AuthProvider>
    <SubscriptionProvider>
      <NavigationContainer>
        <AuthStack />
      </NavigationContainer>
    </SubscriptionProvider>
  </AuthProvider>
);

export default AppNavigator;
