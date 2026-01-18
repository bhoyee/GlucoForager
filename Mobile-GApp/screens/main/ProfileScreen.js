// screens/main/ProfileScreen.js
import React, { useCallback, useContext, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Linking, Share, Platform, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { AuthContext } from '../../context/authContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { apiFetch } from '../../utils/api';
import { configureRevenueCat, getCustomerInfo, isPremiumEntitled, presentCustomerCenter, presentPaywall } from '../../utils/revenuecat';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { signOut } = useContext(AuthContext);
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = tabBarHeight + Math.max(insets.bottom, 16);
  const appStoreUrl = 'itms-apps://itunes.apple.com/app/id0000000000';
  const playStoreUrl = 'market://details?id=com.glucoforager.app';
  const shareUrl = 'https://glucoforager.com/app';
  const [profile, setProfile] = useState({
    fullName: '',
    email: '',
    subscriptionTier: 'free',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isUpgrading, setIsUpgrading] = useState(false);

  const syncSubscription = async () => {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return false;
    const response = await apiFetch(
      `${API_URL}${API_ENDPOINTS.SUBSCRIPTION_UPGRADE}`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      { onUnauthorized: signOut }
    );
    return response.ok;
  };

  const getInitials = (name, email) => {
    const safeName = `${name || ''}`.trim();
    if (safeName) {
      const parts = safeName.split(/\s+/).filter(Boolean);
      const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '');
      return initials.join('') || 'GF';
    }
    const emailPrefix = `${email || ''}`.split('@')[0];
    if (emailPrefix) {
      return emailPrefix.slice(0, 2).toUpperCase();
    }
    return 'GF';
  };

  const loadProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError('');
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setProfile({ fullName: '', email: '', subscriptionTier: 'free' });
        return;
      }
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.USER_PROFILE}`,
        { headers: { Authorization: `Bearer ${token}` } },
        { onUnauthorized: signOut }
      );
      if (response.status === 401) {
        return;
      }
      if (!response.ok) {
        setLoadError('Unable to load profile right now.');
        return;
      }
      const data = await response.json();
      const nextProfile = {
        fullName: data.full_name || '',
        email: data.email || '',
        subscriptionTier: data.subscription_tier || 'free',
      };
      setProfile(nextProfile);

      try {
        const info = await getCustomerInfo();
        const hasPremium = isPremiumEntitled(info);
        if (hasPremium && nextProfile.subscriptionTier !== 'premium') {
          await syncSubscription();
          setProfile((prev) => ({ ...prev, subscriptionTier: 'premium' }));
        }
      } catch (error) {
        // Ignore RevenueCat sync errors.
      }
    } catch (error) {
      setLoadError('Unable to load profile right now.');
    } finally {
      setIsLoading(false);
    }
  }, [signOut]);

  const handleUpgrade = async () => {
    try {
      setIsUpgrading(true);
      const token = await AsyncStorage.getItem('userToken');
      if (token) {
        const profileResponse = await apiFetch(
          `${API_URL}${API_ENDPOINTS.USER_PROFILE}`,
          { headers: { Authorization: `Bearer ${token}` } },
          { onUnauthorized: signOut }
        );
        if (profileResponse.status !== 401 && profileResponse.ok) {
          const profileData = await profileResponse.json();
          await configureRevenueCat({
            token,
            publicId: profileData?.public_id || null,
            email: profileData?.email || null,
            fullName: profileData?.full_name || null,
          });
        }
      }
      const result = await presentPaywall();
      const info = result?.customerInfo ? result.customerInfo : await getCustomerInfo();
      const hasPremium = isPremiumEntitled(info);
      if (hasPremium) {
        await syncSubscription();
        await loadProfile();
        Alert.alert('Success', 'Premium unlocked.');
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to start subscription right now.');
    } finally {
      setIsUpgrading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleRateUs = async () => {
    const url = Platform.OS === 'ios' ? appStoreUrl : playStoreUrl;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
      return;
    }
    Alert.alert('Unavailable', 'Store link not available yet.');
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out GlucoForager: ${shareUrl}`,
      });
    } catch (error) {
      Alert.alert('Share failed', 'Could not open share options.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <Text style={styles.title}>Profile</Text>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
      >

      {/* User Info */}
      <View style={styles.userCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {getInitials(profile.fullName, profile.email)}
          </Text>
        </View>
        <View style={styles.userInfo}>
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading profile...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.userName}>
                {profile.fullName || 'User'}
              </Text>
              <Text style={styles.userEmail}>
                {profile.email || 'No email on file'}
              </Text>
            </>
          )}
          {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}
          <View style={styles.membershipBadge}>
            <Ionicons name="star" size={14} color={Colors.warning} />
            <Text style={styles.membershipText}>
              {profile.subscriptionTier === 'premium' ? 'Premium Plan' : 'Free Plan'}
            </Text>
          </View>
        </View>
      </View>

      {/* Upgrade Card */}
      {profile.subscriptionTier !== 'premium' && (
        <TouchableOpacity style={styles.upgradeCard} onPress={handleUpgrade} disabled={isUpgrading}>
          <View>
            <Text style={styles.upgradeTitle}>Upgrade to Premium</Text>
            <Text style={styles.upgradeSubtitle}>Unlock all features</Text>
          </View>
          {isUpgrading ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="arrow-forward" size={24} color={Colors.primary} />
          )}
        </TouchableOpacity>
      )}

      {/* Menu Items */}
      <View style={styles.menuSection}>
        <Text style={styles.sectionTitle}>Account</Text>
        
        <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('PersonalInfo')}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="person-outline" size={22} color={Colors.text} />
            <Text style={styles.menuText}>Edit Personal Info</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={presentCustomerCenter}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="card-outline" size={22} color={Colors.text} />
            <Text style={styles.menuText}>Manage Subscription</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
        </TouchableOpacity>

      </View>

      <View style={styles.menuSection}>
        <Text style={styles.sectionTitle}>Social</Text>

        <TouchableOpacity style={styles.menuItem} onPress={handleRateUs}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="star-outline" size={22} color={Colors.text} />
            <Text style={styles.menuText}>Rate Us</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={handleShare}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="share-social-outline" size={22} color={Colors.text} />
            <Text style={styles.menuText}>Share with Friends</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => Alert.alert('Contact Us', 'hello@glucoforager.com')}
        >
          <View style={styles.menuItemLeft}>
            <Ionicons name="mail-outline" size={22} color={Colors.text} />
            <Text style={styles.menuText}>Contact Us</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
        </TouchableOpacity>
      </View>

      <View style={styles.menuSection}>
        <Text style={styles.sectionTitle}>Legal</Text>
        
        <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Terms')}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="document-text-outline" size={22} color={Colors.text} />
            <Text style={styles.menuText} numberOfLines={2}>
              Terms & Conditions
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('PrivacyPolicy')}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="shield-checkmark-outline" size={22} color={Colors.text} />
            <Text style={styles.menuText} numberOfLines={2}>
              Privacy Policy
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() =>
            Alert.alert('About', 'GlucoForager helps you find diabetes-friendly recipes from your ingredients.')
          }
        >
          <View style={styles.menuItemLeft}>
            <Ionicons name="information-circle-outline" size={22} color={Colors.text} />
            <Text style={styles.menuText} numberOfLines={2}>
              About
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
        </TouchableOpacity>
      </View>

      <View style={styles.versionContainer}>
        <View style={styles.versionRow}>
          <Text style={styles.versionText}>GlucoForager</Text>
          <Text style={styles.versionSubText}>v1.0</Text>
        </View>
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.text,
  },
  logoutText: {
    color: Colors.error,
    fontSize: 16,
    fontWeight: '600',
  },
  userCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    color: Colors.textLight,
    marginBottom: 8,
  },
  membershipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.warning}15`,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  membershipText: {
    color: Colors.warning,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 12,
    color: Colors.textLight,
  },
  errorText: {
    fontSize: 12,
    color: Colors.error,
    marginBottom: 6,
  },
  upgradeCard: {
    backgroundColor: Colors.primary,
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  upgradeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  upgradeSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  menuSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textLight,
    marginBottom: 12,
    marginLeft: 20,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 1,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  menuText: {
    fontSize: 16,
    color: Colors.text,
    marginLeft: 12,
    flex: 1,
    flexWrap: 'wrap',
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  versionText: {
    fontSize: 14,
    color: Colors.textLight,
  },
  versionSubText: {
    marginLeft: 6,
    fontSize: 12,
    color: Colors.textMuted,
  },
});
