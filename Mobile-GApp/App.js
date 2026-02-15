// App.js - COMPLETE FIXED VERSION
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LogBox, View, Text } from 'react-native';

// Import Auth Provider
import { AuthProvider, useAuth } from './context/authContext';
import { configureRevenueCat } from './utils/revenuecat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { startMobileLogUploader } from './utils/mobileLogUploader';

// Import screens
import SplashScreen from './screens/SplashScreen';
import OnboardingScreen from './screens/onboarding/OnboardingScreen';
import LoginScreen from './screens/auth/LoginScreen';
import SignUpScreen from './screens/auth/SignUpScreen';
import ForgotPasswordScreen from './screens/auth/ForgotPasswordScreen';
import PremiumDetailsScreen from './screens/auth/PremiumDetailsScreen';
import TermsScreen from './screens/main/TermsScreen';
import PrivacyPolicyScreen from './screens/main/PrivacyPolicyScreen';

// Import main app
import MainTabNavigator from './navigation/MainTabNavigator';

const Stack = createNativeStackNavigator();

function AuthStack() {
  console.log('Rendering AuthStack');
  return (
    <Stack.Navigator 
      initialRouteName="Onboarding"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="PremiumDetails" component={PremiumDetailsScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
    </Stack.Navigator>
  );
}

function AppNavigator() {
  console.log('AppNavigator rendering');
  
  // Add safety check for useAuth
  let authContext;
  try {
    authContext = useAuth();
  } catch (error) {
    console.error('Error accessing auth context:', error);
    // Return a fallback UI or null
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Error loading app</Text>
      </View>
    );
  }

  const { userToken, isLoading } = authContext || {};
  const [minimumSplashDone, setMinimumSplashDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinimumSplashDone(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);
  
  console.log('AppNavigator state:', { userToken, isLoading, hasAuthContext: !!authContext });

  if (isLoading || !minimumSplashDone) {
    console.log('Showing SplashScreen');
    return <SplashScreen />;
  }

  console.log('Showing main navigation. User token:', userToken ? 'Present' : 'None');

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {userToken ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabNavigator} />
            <Stack.Screen name="Terms" component={TermsScreen} />
            <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthStack} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function RevenueCatBootstrap() {
  const { userToken } = useAuth();

  useEffect(() => {
    const sync = async () => {
      const publicId = await AsyncStorage.getItem('publicUserId');
      await configureRevenueCat({ token: userToken, publicId });
    };
    sync();
  }, [userToken]);

  return null;
}

export default function App() {
  console.log('App component rendering');

  useEffect(() => {
    LogBox.ignoreLogs(['[RevenueCat]']);
  }, []);

  useEffect(() => {
    const stopUploader = startMobileLogUploader();
    return () => {
      if (typeof stopUploader === 'function') {
        stopUploader();
      }
    };
  }, []);
  
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RevenueCatBootstrap />
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
