// navigation/MainTabNavigator.js - PRODUCTION FIXED VERSION
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';

// Import all screens
import HomeScreen from '../screens/main/HomeScreen';
import ScanScreen from '../screens/main/ScanScreen';
import FavoritesScreen from '../screens/main/FavoritesScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import PersonalInfoScreen from '../screens/main/PersonalInfoScreen';
import PrivacyPolicyScreen from '../screens/main/PrivacyPolicyScreen';
import TermsScreen from '../screens/main/TermsScreen';
import DebugLogsScreen from '../screens/main/DebugLogsScreen';
import ManualInputScreen from '../screens/main/ManualInputScreen';
import RecipeDetailScreen from '../screens/main/RecipeDetailScreen';
import RecipeResultsScreen from '../screens/main/RecipeResultsScreen';
import ScanResultsScreen from '../screens/main/ScanResultsScreen';
import ScanProcessingScreen from '../screens/main/ScanProcessingScreen';
import StartCookingScreen from '../screens/main/StartCookingScreen';
import RecentRecipesScreen from '../screens/main/RecentRecipesScreen';
import EatNowScreen from '../screens/main/EatNowScreen';
import CarbSwapsScreen from '../screens/main/CarbSwapsScreen';
import ChallengeScreen from '../screens/main/ChallengeScreen';
import TodayTipScreen from '../screens/main/TodayTipScreen';
import TipsArchiveScreen from '../screens/main/TipsArchiveScreen';
import FoodPreferencesScreen from '../screens/main/FoodPreferencesScreen';

const Tab = createBottomTabNavigator();

// Home Stack
const HomeStack = createNativeStackNavigator();
function HomeStackNavigator() {
  return (
    <HomeStack.Navigator 
      screenOptions={{ 
        headerShown: false,
        animation: 'slide_from_right'
      }}
    >
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="ManualInput" component={ManualInputScreen} />
      <HomeStack.Screen name="ScanProcessing" component={ScanProcessingScreen} />
      <HomeStack.Screen name="ScanResults" component={ScanResultsScreen} />
      <HomeStack.Screen name="RecipeResults" component={RecipeResultsScreen} />
      <HomeStack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
      <HomeStack.Screen name="StartCooking" component={StartCookingScreen} />
      <HomeStack.Screen name="RecentRecipes" component={RecentRecipesScreen} />
      <HomeStack.Screen name="EatNow" component={EatNowScreen} />
      <HomeStack.Screen name="CarbSwaps" component={CarbSwapsScreen} />
      <HomeStack.Screen name="Challenge" component={ChallengeScreen} />
      <HomeStack.Screen name="TodayTip" component={TodayTipScreen} />
      <HomeStack.Screen name="TipsArchive" component={TipsArchiveScreen} />
    </HomeStack.Navigator>
  );
}

// Scan Stack
const ScanStack = createNativeStackNavigator();
function ScanStackNavigator() {
  return (
    <ScanStack.Navigator 
      screenOptions={{ 
        headerShown: false,
        animation: 'slide_from_right'
      }}
    >
      <ScanStack.Screen name="ScanMain" component={ScanScreen} />
      <ScanStack.Screen name="ScanProcessing" component={ScanProcessingScreen} />
      <ScanStack.Screen name="ScanResults" component={ScanResultsScreen} />
      <ScanStack.Screen name="RecipeResults" component={RecipeResultsScreen} />
      <ScanStack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
      <ScanStack.Screen name="StartCooking" component={StartCookingScreen} />
    </ScanStack.Navigator>
  );
}

// Favorites Stack
const FavoritesStack = createNativeStackNavigator();
function FavoritesStackNavigator() {
  return (
    <FavoritesStack.Navigator 
      screenOptions={{ 
        headerShown: false,
        animation: 'slide_from_right'
      }}
    >
      <FavoritesStack.Screen name="FavoritesMain" component={FavoritesScreen} />
      <FavoritesStack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
      <FavoritesStack.Screen name="StartCooking" component={StartCookingScreen} />
    </FavoritesStack.Navigator>
  );
}

// Profile Stack
const ProfileStack = createNativeStackNavigator();
function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator 
      screenOptions={{ 
        headerShown: false,
        animation: 'slide_from_right'
      }}
    >
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStack.Screen name="PersonalInfo" component={PersonalInfoScreen} />
      <ProfileStack.Screen name="FoodPreferences" component={FoodPreferencesScreen} />
      <ProfileStack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      <ProfileStack.Screen name="Terms" component={TermsScreen} />
      <ProfileStack.Screen name="DebugLogs" component={DebugLogsScreen} />
    </ProfileStack.Navigator>
  );
}

export default function MainTabNavigator() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textLight,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          paddingTop: 8,
          paddingBottom: Math.max(18, insets.bottom + 14),
          height: 72 + Math.max(0, insets.bottom + 14),
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
        headerShown: false,
        // Optional: Hide tab bar on specific screens
        tabBarHideOnKeyboard: true,
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeStackNavigator}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      
      <Tab.Screen 
        name="Scan" 
        component={ScanStackNavigator}
        options={{
          tabBarLabel: 'Scan',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="camera-outline" size={size} color={color} />
          ),
        }}
      />
      
      <Tab.Screen 
        name="Favorites" 
        component={FavoritesStackNavigator}
        options={{
          tabBarLabel: 'Favorites',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="heart-outline" size={size} color={color} />
          ),
        }}
      />
      
      <Tab.Screen 
        name="Profile" 
        component={ProfileStackNavigator}
        options={{
          tabBarLabel: 'Profile',
          popToTopOnBlur: true,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
        listeners={({ navigation, route }) => ({
          tabPress: (e) => {
            const state = route?.state;
            if (state && typeof state.index === 'number' && state.index > 0) {
              e.preventDefault();
              navigation.navigate('Profile', { screen: 'ProfileMain' });
            }
          },
        })}
      />
    </Tab.Navigator>
  );
}
