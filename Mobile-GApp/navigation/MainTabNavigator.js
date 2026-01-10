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
import ManualInputScreen from '../screens/main/ManualInputScreen';
import RecipeDetailScreen from '../screens/main/RecipeDetailScreen';
import RecipeResultsScreen from '../screens/main/RecipeResultsScreen';
import ScanResultsScreen from '../screens/main/ScanResultsScreen';
import StartCookingScreen from '../screens/main/StartCookingScreen';

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
      <HomeStack.Screen name="ScanResults" component={ScanResultsScreen} />
      <HomeStack.Screen name="RecipeResults" component={RecipeResultsScreen} />
      <HomeStack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
      <HomeStack.Screen name="StartCooking" component={StartCookingScreen} />
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
      {/* IMPORTANT: Name this "Scan" for easy navigation */}
      <ScanStack.Screen name="Scan" component={ScanScreen} />
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
      <FavoritesStack.Screen name="Favorites" component={FavoritesScreen} />
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
      <ProfileStack.Screen name="Profile" component={ProfileScreen} />
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
          paddingBottom: Math.max(8, insets.bottom),
          height: 60 + Math.max(0, insets.bottom - 4),
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
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
