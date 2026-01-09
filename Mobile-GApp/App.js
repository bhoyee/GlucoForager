// App.js - COMPLETE FIXED VERSION
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Import Auth Provider
import { AuthProvider, useAuth } from './context/authContext';

// Import screens
import SplashScreen from './screens/SplashScreen';
import OnboardingScreen from './screens/onboarding/OnboardingScreen';
import LoginScreen from './screens/auth/LoginScreen';
import SignUpScreen from './screens/auth/SignUpScreen';
import ForgotPasswordScreen from './screens/auth/ForgotPasswordScreen';

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
  
  console.log('AppNavigator state:', { userToken, isLoading, hasAuthContext: !!authContext });

  if (isLoading) {
    console.log('Showing SplashScreen');
    return <SplashScreen />;
  }

  console.log('Showing main navigation. User token:', userToken ? 'Present' : 'None');

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {userToken ? (
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />
        ) : (
          <Stack.Screen name="Auth" component={AuthStack} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// Add imports for View and Text
import { View, Text } from 'react-native';

export default function App() {
  console.log('App component rendering');
  
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}