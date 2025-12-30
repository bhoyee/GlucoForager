import React from 'react';
import { NavigationContainer } from '@react-navigation/native';

import { AuthProvider } from '../context/AuthContext';
import { SubscriptionProvider } from '../context/SubscriptionContext';
import { FavoritesProvider } from '../context/FavoritesContext';
import AuthStack from './AuthStack';

const AppNavigator = () => (
  <AuthProvider>
    <SubscriptionProvider>
      <FavoritesProvider>
        <NavigationContainer>
          <AuthStack />
        </NavigationContainer>
      </FavoritesProvider>
    </SubscriptionProvider>
  </AuthProvider>
);

export default AppNavigator;
