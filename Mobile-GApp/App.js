// App.js - COMPLETE FIXED VERSION
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, Alert, Linking, LogBox, Modal, Pressable, View, Text } from 'react-native';

// Import Auth Provider
import { AuthProvider, useAuth } from './context/authContext';
import { configureRevenueCat } from './utils/revenuecat';
import { startMobileLogUploader } from './utils/mobileLogUploader';
import {
  configureMealReminderNotificationHandler,
  enableMealRemindersAndSchedule,
  getMealRemindersEnabled,
  getMealRemindersPrompted,
  setMealRemindersPrompted,
  syncMealRemindersOnAppStart,
} from './utils/mealReminders';
import { checkForAppUpdate, dismissUpdateForVersion, openStoreForUpdate } from './utils/appUpdate';

// Import screens
import SplashScreen from './screens/SplashScreen';
import OnboardingScreen from './screens/onboarding/OnboardingScreen';
import LoginScreen from './screens/auth/LoginScreen';
import SignUpScreen from './screens/auth/SignUpScreen';
import ForgotPasswordScreen from './screens/auth/ForgotPasswordScreen';
import PremiumDetailsScreen from './screens/auth/PremiumDetailsScreen';
import TermsScreen from './screens/main/TermsScreen';
import PrivacyPolicyScreen from './screens/main/PrivacyPolicyScreen';
import FoodPreferencesScreen from './screens/main/FoodPreferencesScreen';

// Import main app
import MainTabNavigator from './navigation/MainTabNavigator';

const Stack = createNativeStackNavigator();

const devLog = (...args) => {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console.log(...args);
};

function AuthStack() {
  devLog('Rendering AuthStack');
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
  devLog('AppNavigator rendering');
  
  // Add safety check for useAuth
  let authContext;
  try {
    authContext = useAuth();
  } catch (error) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error('Error accessing auth context:', error);
    }
    // Return a fallback UI or null
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Error loading app</Text>
      </View>
    );
  }

  const {
    userToken,
    isLoading,
    needsFoodProfileOnboarding,
    hasFeatureAccess,
  } = authContext || {};
  const [minimumSplashDone, setMinimumSplashDone] = useState(false);
  const [updatePrompt, setUpdatePrompt] = useState(null);
  const [mealPromptVisible, setMealPromptVisible] = useState(false);
  const [mealPromptBusy, setMealPromptBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinimumSplashDone(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isLoading || !minimumSplashDone) return;
    let cancelled = false;
    const run = async () => {
      try {
        devLog('[AppUpdate] Checking for app update...');
        const result = await checkForAppUpdate();
        devLog('[AppUpdate] Update check result', result);
        if (!cancelled && result?.available) {
          setUpdatePrompt(result);
        }
      } catch {
        // Ignore.
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isLoading, minimumSplashDone]);

  useEffect(() => {
    if (isLoading || !minimumSplashDone) return;
    if (!userToken) return;
    if (hasFeatureAccess !== true) return;
    if (updatePrompt?.available) return;
    let cancelled = false;

    const run = async () => {
      try {
        const [enabled, prompted] = await Promise.all([
          getMealRemindersEnabled(),
          getMealRemindersPrompted(),
        ]);
        if (!cancelled && !enabled && !prompted) {
          setMealPromptVisible(true);
        }
      } catch {
        // Ignore.
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [hasFeatureAccess, isLoading, minimumSplashDone, updatePrompt?.available, userToken]);

  devLog('AppNavigator state:', { isLoading, hasToken: Boolean(userToken), hasAuthContext: !!authContext });

  if (isLoading || !minimumSplashDone) {
    devLog('Showing SplashScreen');
    return <SplashScreen />;
  }

  devLog('Showing main navigation. User token:', userToken ? 'Present' : 'None');

  return (
    <NavigationContainer>
      <Modal
        transparent
        visible={mealPromptVisible}
        animationType="fade"
        onRequestClose={() => {
          setMealRemindersPrompted();
          setMealPromptVisible(false);
        }}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 18 }}
          onPress={() => {
            setMealRemindersPrompted();
            setMealPromptVisible(false);
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: 16,
              padding: 18,
              maxWidth: 520,
              width: '100%',
              alignSelf: 'center',
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#0C1824' }}>Enable notifications?</Text>
            <Text style={{ marginTop: 8, color: '#374151', lineHeight: 20 }}>
              Get helpful reminders and updates from GlucoForager. You can change this anytime in Profile.
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <Pressable
                disabled={mealPromptBusy}
                onPress={async () => {
                  await setMealRemindersPrompted();
                  setMealPromptVisible(false);
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: '#F3F4F6',
                  opacity: mealPromptBusy ? 0.65 : 1,
                }}
              >
                <Text style={{ fontWeight: '700', color: '#111827' }}>Not now</Text>
              </Pressable>
              <Pressable
                disabled={mealPromptBusy}
                onPress={async () => {
                  setMealPromptBusy(true);
                  try {
                    await setMealRemindersPrompted();
                    const result = await enableMealRemindersAndSchedule();
                    if (!result?.scheduled) {
                      Alert.alert(
                        'Notifications disabled',
                        'Please allow notifications in your device Settings to enable reminders.',
                        [
                          { text: 'Not now', style: 'cancel' },
                          {
                            text: 'Open settings',
                            onPress: () => {
                              try {
                                Linking.openSettings();
                              } catch {
                                // Ignore.
                              }
                            },
                          },
                        ]
                      );
                    }
                    setMealPromptVisible(false);
                  } finally {
                    setMealPromptBusy(false);
                  }
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: '#0D9488',
                  opacity: mealPromptBusy ? 0.65 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {mealPromptBusy ? <ActivityIndicator size="small" color="white" /> : null}
                <Text style={{ fontWeight: '700', color: 'white' }}>Enable</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        transparent
        visible={Boolean(updatePrompt?.available)}
        animationType="fade"
        onRequestClose={() => {
          if (updatePrompt?.latestVersion) {
            dismissUpdateForVersion(updatePrompt.latestVersion);
          }
          setUpdatePrompt(null);
        }}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 18 }}
          onPress={() => {
            if (updatePrompt?.latestVersion) {
              dismissUpdateForVersion(updatePrompt.latestVersion);
            }
            setUpdatePrompt(null);
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: 16,
              padding: 18,
              maxWidth: 520,
              width: '100%',
              alignSelf: 'center',
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#0C1824' }}>Update available</Text>
            <Text style={{ marginTop: 8, color: '#374151', lineHeight: 20 }}>
              A newer version of GlucoForager is available. Please update to get the latest fixes and improvements.
            </Text>
            <Text style={{ marginTop: 10, color: '#6B7280' }}>
              Current: {updatePrompt?.currentVersion || '--'} • Latest: {updatePrompt?.latestVersion || '--'}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <Pressable
                onPress={() => {
                  if (updatePrompt?.latestVersion) {
                    dismissUpdateForVersion(updatePrompt.latestVersion);
                  }
                  setUpdatePrompt(null);
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: '#F3F4F6',
                }}
              >
                <Text style={{ fontWeight: '700', color: '#111827' }}>Later</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  await openStoreForUpdate(updatePrompt?.storeUrl);
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: '#0D9488',
                }}
              >
                <Text style={{ fontWeight: '700', color: 'white' }}>Update</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {userToken ? (
          needsFoodProfileOnboarding ? (
            <>
              <Stack.Screen
                name="FoodPreferencesOnboarding"
                component={FoodPreferencesScreen}
                initialParams={{ forced: true }}
              />
              <Stack.Screen name="Terms" component={TermsScreen} />
              <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
            </>
          ) : (
            <>
              <Stack.Screen name="MainTabs" component={MainTabNavigator} />
              <Stack.Screen name="Terms" component={TermsScreen} />
              <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
            </>
          )
        ) : (
          <Stack.Screen name="Auth" component={AuthStack} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function RevenueCatBootstrap() {
  useEffect(() => {
    // Configure RevenueCat exactly once per session (anonymous).
    // Logged-in identity is linked later when needed (e.g. before purchase/customer center).
    const boot = async () => {
      try {
        await configureRevenueCat();
      } catch (error) {
        // Never crash the app if RevenueCat fails in review/sandbox.
      }
    };
    boot();
  }, []);

  return null;
}

function MealRemindersBootstrap() {
  useEffect(() => {
    configureMealReminderNotificationHandler();
    const boot = async () => {
      try {
        await syncMealRemindersOnAppStart();
      } catch {
        // Never crash the app if scheduling fails.
      }
    };
    boot();
  }, []);

  return null;
}

export default function App() {
  devLog('App component rendering');

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
        <MealRemindersBootstrap />
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}


