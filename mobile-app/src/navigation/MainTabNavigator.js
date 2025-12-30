import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import HomeScreen from '../screens/HomeScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ResultsScreen from '../screens/ResultsScreen';
import RecipeDetailScreen from '../screens/RecipeDetailScreen';
import UpgradeScreen from '../screens/UpgradeScreen';
import FreeCameraScreen from '../screens/FreeCameraScreen';
import PremiumCameraScreen from '../screens/PremiumCameraScreen';
import PremiumDashboard from '../screens/PremiumDashboard';
import { colors } from '../styles/global';

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

const HomeStackScreen = () => (
  <HomeStack.Navigator screenOptions={{ headerShown: false }}>
    <HomeStack.Screen name="HomeScreen" component={HomeScreen} />
    <HomeStack.Screen name="Results" component={ResultsScreen} />
    <HomeStack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
    <HomeStack.Screen name="FreeCamera" component={FreeCameraScreen} />
    <HomeStack.Screen name="PremiumCamera" component={PremiumCameraScreen} />
  </HomeStack.Navigator>
);

const ProfileStackScreen = () => (
  <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
    <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} />
    <ProfileStack.Screen name="Upgrade" component={UpgradeScreen} />
    <ProfileStack.Screen name="PremiumDashboard" component={PremiumDashboard} />
  </ProfileStack.Navigator>
);

const MainTabNavigator = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.surface },
      tabBarIcon: ({ color, size }) => {
        const icons = {
          Home: 'home',
          Favorites: 'heart',
          Profile: 'person',
        };
        return <Ionicons name={icons[route.name]} size={size} color={color} />;
      },
    })}
  >
    <Tab.Screen name="Home" component={HomeStackScreen} options={{ headerShown: false }} />
    <Tab.Screen name="Favorites" component={FavoritesScreen} />
    <Tab.Screen name="Profile" component={ProfileStackScreen} options={{ headerShown: false }} />
  </Tab.Navigator>
);

export default MainTabNavigator;
