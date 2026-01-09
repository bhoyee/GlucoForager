// screens/main/HomeScreen.js - UPDATED PRODUCTION VERSION
import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  getTodayScans, 
  getRemainingScans, 
  initializeScans,
  canUserScan 
} from '../../utils/scanTracker';

export default function HomeScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  
  const [userIsPremium, setUserIsPremium] = useState(false);
  const [todayScans, setTodayScans] = useState(0);
  const [remainingScans, setRemainingScans] = useState(3);
  const [userName, setUserName] = useState("User");
  const [isLoading, setIsLoading] = useState(true);

  const recentRecipes = [
    { id: 1, name: 'Mediterranean Chicken Salad', time: '25 min', match: '5/7' },
    { id: 2, name: 'Zucchini Noodles', time: '15 min', match: '4/6' },
    { id: 3, name: 'Grilled Salmon', time: '20 min', match: '6/8' },
  ];

  // Load user data
  useEffect(() => {
    const loadUserData = async () => {
      try {
        setIsLoading(true);
        
        // Initialize scan tracking
        await initializeScans();
        
        // Load user data from AsyncStorage
        const premiumStatus = await AsyncStorage.getItem('userIsPremium') || 'false';
        const name = await AsyncStorage.getItem('userName') || "User";
        const scansUsed = await getTodayScans();
        const remaining = await getRemainingScans(premiumStatus === 'true');
        
        setUserIsPremium(premiumStatus === 'true');
        setUserName(name);
        setTodayScans(scansUsed);
        setRemainingScans(remaining);
        
      } catch (error) {
        console.error('Error loading user data:', error);
        // Set defaults on error
        setUserIsPremium(false);
        setUserName("User");
        setTodayScans(0);
        setRemainingScans(3);
      } finally {
        setIsLoading(false);
      }
    };
    
    if (isFocused) {
      loadUserData();
    }
  }, [isFocused]);

  const checkScanLimit = async () => {
    try {
      // Check if user can scan
      const canScan = await canUserScan(userIsPremium);
      
      if (canScan) {
        // Navigate to Scan tab
        navigation.navigate('Scan');
      } else {
        Alert.alert(
          'Daily Limit Reached',
          'You have used all 3 free scans today. Upgrade to Premium for unlimited scans.',
          [
            { text: 'OK', style: 'cancel' },
            { 
              text: 'Upgrade', 
              onPress: () => navigation.navigate('Profile')
            }
          ]
        );
      }
    } catch (error) {
      console.error('Error checking scan limit:', error);
      Alert.alert('Error', 'Unable to check scan limit. Please try again.');
    }
  };

  const handleScanPress = () => {
    checkScanLimit();
  };

  const handleManualInputPress = () => {
    navigation.navigate('ManualInput');
  };

  const handleViewRecipeDetail = (recipeId) => {
    navigation.navigate('RecipeDetail', { id: recipeId });
  };

  const handleViewAllRecipes = () => {
    navigation.navigate('RecipeResults', { 
      title: 'All Recipes',
      showBack: true 
    });
  };

  const handleUpgradePress = () => {
    navigation.navigate('Profile');
  };

  // Development reset button (remove in production)
  const handleResetScans = async () => {
    if (!__DEV__) return; // Only in development
    
    Alert.alert(
      'Reset Scans (Dev Only)',
      'This will reset your scan counter to 0.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: async () => {
            try {
              const { resetScansForTesting } = await import('../../utils/scanTracker');
              await resetScansForTesting();
              
              // Update state
              const scansUsed = await getTodayScans();
              const remaining = await getRemainingScans(userIsPremium);
              
              setTodayScans(scansUsed);
              setRemainingScans(remaining);
              Alert.alert('Success', 'Scans reset to 0');
            } catch (error) {
              Alert.alert('Error', 'Failed to reset scans');
            }
          }
        }
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back, {userName} 👋</Text>
            <Text style={styles.subGreeting}>What's cooking today?</Text>
          </View>
          <TouchableOpacity 
            style={styles.notificationButton}
            onPress={() => navigation.navigate('Profile')}
          >
            <Ionicons name="notifications-outline" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {/* Search Counter Card */}
        <View style={styles.counterCard}>
          <View style={styles.counterHeader}>
            <View>
              <Text style={styles.counterTitle}>Daily Scans</Text>
              <Text style={styles.counterSubtitle}>
                {userIsPremium ? 'Unlimited scans' : `${remainingScans} scans remaining today`}
              </Text>
            </View>
            <View style={styles.counterIcon}>
              <Ionicons name="camera-outline" size={24} color={Colors.primary} />
            </View>
          </View>
          
          {!userIsPremium && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${(todayScans / 3) * 100}%` }]} />
            </View>
          )}
          
          {!userIsPremium && remainingScans === 0 && (
            <TouchableOpacity 
              style={styles.upgradePrompt}
              onPress={handleUpgradePress}
            >
              <Text style={styles.upgradeText}>Upgrade to Premium for unlimited scans</Text>
              <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Main Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Find Recipes</Text>
          
          {/* Camera Scan Card */}
          <TouchableOpacity 
            style={styles.actionCard}
            onPress={handleScanPress}
          >
            <View style={styles.actionContent}>
              <View style={[styles.actionIcon, { backgroundColor: `${Colors.primary}15` }]}>
                <Ionicons name="camera-outline" size={28} color={Colors.primary} />
              </View>
              <View style={styles.actionText}>
                <Text style={styles.actionTitle}>Scan Ingredients</Text>
                <Text style={styles.actionDescription}>
                  {userIsPremium 
                    ? 'Take a photo of your fridge' 
                    : `${remainingScans} scans left today`
                  }
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={Colors.textLight} />
            </View>
          </TouchableOpacity>

          {/* Manual Input Card */}
          <TouchableOpacity 
            style={styles.actionCard}
            onPress={handleManualInputPress}
          >
            <View style={styles.actionContent}>
              <View style={[styles.actionIcon, { backgroundColor: `${Colors.secondary}15` }]}>
                <Ionicons name="create-outline" size={28} color={Colors.secondary} />
              </View>
              <View style={styles.actionText}>
                <Text style={styles.actionTitle}>Type Ingredients</Text>
                <Text style={styles.actionDescription}>Enter what you have manually - Always free</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={Colors.textLight} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Recent Recipes */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Recipes</Text>
            <TouchableOpacity onPress={handleViewAllRecipes}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.recipesScroll}
          >
            {recentRecipes.map((recipe) => (
              <TouchableOpacity 
                key={recipe.id}
                style={styles.recipeCard}
                onPress={() => handleViewRecipeDetail(recipe.id)}
              >
                <View style={styles.recipeImage}>
                  <Ionicons name="restaurant-outline" size={40} color={Colors.textLight} />
                </View>
                <View style={styles.recipeInfo}>
                  <View style={styles.recipeHeader}>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>Diabetes-Safe</Text>
                    </View>
                    <Text style={styles.recipeTime}>{recipe.time}</Text>
                  </View>
                  <Text style={styles.recipeName} numberOfLines={2}>
                    {recipe.name}
                  </Text>
                  <Text style={styles.recipeMatch}>
                    Uses {recipe.match} ingredients
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Upgrade Banner */}
        {!userIsPremium && (
          <View style={styles.section}>
            <TouchableOpacity 
              style={styles.upgradeBanner}
              onPress={handleUpgradePress}
            >
              <View style={styles.upgradeContent}>
                <View>
                  <Text style={styles.upgradeBannerTitle}>Unlock Premium Features</Text>
                  <Text style={styles.upgradeBannerSubtitle}>
                    Unlimited scans, advanced filters, and no ads
                  </Text>
                  <View style={styles.priceContainer}>
                    <Text style={styles.price}>£2.99</Text>
                    <Text style={styles.pricePeriod}>/month</Text>
                  </View>
                </View>
                <Ionicons name="sparkles" size={32} color="white" />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Stats */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Your Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>12</Text>
              <Text style={styles.statLabel}>Recipes found</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{todayScans}</Text>
              <Text style={styles.statLabel}>Scans today</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>45m</Text>
              <Text style={styles.statLabel}>Time saved</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Development Only: Reset Button */}
      {__DEV__ && (
        <TouchableOpacity 
          style={styles.devResetButton}
          onPress={handleResetScans}
          onLongPress={async () => {
            // Long press to set as premium
            await AsyncStorage.setItem('userIsPremium', 'true');
            setUserIsPremium(true);
            const remaining = await getRemainingScans(true);
            setRemainingScans(remaining);
            Alert.alert('Dev Mode', 'Set as premium user');
          }}
        >
          <Ionicons name="bug-outline" size={20} color="white" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.textLight,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
  },
  subGreeting: {
    fontSize: 16,
    color: Colors.textLight,
    marginTop: 4,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  counterCard: {
    backgroundColor: Colors.primary,
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  counterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  counterTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  counterSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
  },
  counterIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'white',
    borderRadius: 3,
  },
  upgradePrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  upgradeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
    marginRight: 6,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.text,
  },
  seeAllText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  recipesScroll: {
    marginLeft: -20,
    paddingLeft: 20,
  },
  actionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  actionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  actionText: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  actionDescription: {
    fontSize: 14,
    color: Colors.textLight,
  },
  recipeCard: {
    width: 280,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginRight: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  recipeImage: {
    height: 140,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipeInfo: {
    padding: 16,
  },
  recipeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: {
    backgroundColor: `${Colors.success}15`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: Colors.success,
    fontSize: 12,
    fontWeight: '600',
  },
  recipeTime: {
    fontSize: 14,
    color: Colors.textLight,
  },
  recipeName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
    lineHeight: 22,
  },
  recipeMatch: {
    fontSize: 14,
    color: Colors.textLight,
  },
  upgradeBanner: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  upgradeContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  upgradeBannerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  upgradeBannerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 12,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  pricePeriod: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginLeft: 4,
  },
  statsSection: {
    paddingHorizontal: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textLight,
    textAlign: 'center',
  },
  devResetButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: '#FF3B30',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
});