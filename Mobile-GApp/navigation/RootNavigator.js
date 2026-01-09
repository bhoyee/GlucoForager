import React, { useContext, useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AuthContext } from "../context/authContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

const Stack = createNativeStackNavigator();

import SplashScreen from "../screens/SplashScreen";
import OnboardingScreen from "../screens/onboarding/OnboardingScreen";
import LoginScreen from "../screens/auth/LoginScreen";
import SignUpScreen from "../screens/auth/SignUpScreen";
import ForgotPasswordScreen from "../screens/auth/ForgotPasswordScreen";
import MainTabNavigator from "./MainTabNavigator";

export function RootNavigatorContent() {
  const { userToken, isLoading } = useContext(AuthContext);
  
  console.log("🔥 RootNavigator RENDER - Auth State:", { 
    isLoading, 
    userToken, 
    hasToken: !!userToken 
  });
  
  const [showOnboarding, setShowOnboarding] = useState(null);
  const [minimumSplashDone, setMinimumSplashDone] = useState(false);

  // Minimum splash screen time (2 seconds)
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinimumSplashDone(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // Check onboarding status after auth loads
  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        // If user is logged in, skip onboarding
        if (userToken) {
          console.log("✅ User is logged in, skipping onboarding check");
          setShowOnboarding(false);
          return;
        }
        
        // Only check onboarding for non-logged-in users
        const hasSeenOnboarding = await AsyncStorage.getItem('hasSeenOnboarding');
        console.log("📋 Onboarding check:", { hasSeenOnboarding });
        setShowOnboarding(hasSeenOnboarding !== 'true');
      } catch (error) {
        console.error(error);
        setShowOnboarding(true);
      }
    };
    
    if (!isLoading) {
      checkOnboarding();
    }
  }, [isLoading, userToken]); // Add userToken as dependency

  // Show splash while loading auth state OR minimum time not passed
  if (isLoading || !minimumSplashDone || showOnboarding === null) {
    console.log("⏳ Showing splash:", { 
      isLoading, 
      minimumSplashDone, 
      showOnboarding,
      userToken: userToken ? "YES" : "NO" 
    });
    return <SplashScreen />;
  }

  console.log("🚀 Navigation decision:", { 
    userToken: userToken ? "YES" : "NO", 
    showOnboarding,
    shouldShowHome: !!userToken,
    shouldShowOnboarding: !userToken && showOnboarding,
    shouldShowLogin: !userToken && !showOnboarding
  });

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {userToken ? ( // CHECK USERTOKEN FIRST - THIS IS THE KEY FIX!
          // Logged in users: Main app with TABS
          <Stack.Screen
            name="MainTabs"
            component={MainTabNavigator}
            options={{ headerShown: false }}
          />
        ) : showOnboarding ? (
          // First time users (no token): Onboarding flow
          <>
            <Stack.Screen
              name="Onboarding"
              component={OnboardingScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="SignUp"
              component={SignUpScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ForgotPassword"
              component={ForgotPasswordScreen}
              options={{ headerShown: false }}
            />
          </>
        ) : (
          // Returning users (no token, has seen onboarding): Auth flow
          <>
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="SignUp"
              component={SignUpScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ForgotPassword"
              component={ForgotPasswordScreen}
              options={{ headerShown: false }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}