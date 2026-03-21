// screens/main/ProfileScreen.js
import React, { useCallback, useContext, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Linking, Share, Platform, ActivityIndicator, Modal, Pressable, Switch } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Colors } from '../../constants/Colors';
import { AuthContext } from '../../context/authContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { apiFetch } from '../../utils/api';
import { configureRevenueCat, getCustomerInfo, getOfferings, getPaywallOffering, isPremiumEntitled, isRevenueCatConfigured, presentCustomerCenter, presentPaywall, restorePurchases } from '../../utils/revenuecat';
import { disableMealReminders, enableMealRemindersAndSchedule, getMealRemindersEnabled, setMealRemindersPrompted } from '../../utils/mealReminders';
import { disableExpoPushTokens, registerExpoPushToken } from '../../utils/pushToken';
import { addDebugLog } from '../../utils/debugLogger';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { signOut, foodProfileHasPreferences } = useContext(AuthContext);
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const headerPaddingTop = Math.max(insets.top, 16);
  const versionFooterBottom = Math.max(tabBarHeight, 0) + Math.max(insets.bottom, 0) + 8;
  const versionFooterHeight = 44;
  // Modal overlays the tab bar, so we only need to respect safe-area inset.
  const premiumModalBottomPadding = Math.max(insets.bottom, 14) + 14;
  const appStoreUrl = 'https://apps.apple.com/us/app/glucoforager/id6758808427?action=write-review';
  const playStoreUrl = 'market://details?id=com.glucoforager.app';
  const playStoreWebUrl = 'https://play.google.com/store/apps/details?id=com.glucoforager.app';
  const shareUrl = 'https://glucoforager.com/app';
  const privacyPolicyUrl = 'https://www.glucoforager.com/privacy-policy';
  const eulaUrl =
    Platform.OS === 'ios'
      ? 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
      : 'https://play.google.com/about/play-terms/';
  const [profile, setProfile] = useState({
    fullName: '',
    email: '',
    subscriptionTier: 'free',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [premiumModalVisible, setPremiumModalVisible] = useState(false);
  const [premiumModalBusy, setPremiumModalBusy] = useState(false);
  const [premiumModalError, setPremiumModalError] = useState('');
  const [premiumPriceLine, setPremiumPriceLine] = useState('');
  const [premiumOfferingId, setPremiumOfferingId] = useState('');
  const [premiumProductId, setPremiumProductId] = useState('');
  const [mealRemindersEnabled, setMealRemindersEnabled] = useState(false);
  const [mealRemindersBusy, setMealRemindersBusy] = useState(false);
  const [debugTapCount, setDebugTapCount] = useState(0);
  const [debugTapTimer, setDebugTapTimer] = useState(null);
  const debugTapThreshold = 7;
  const revenueCatReady = isRevenueCatConfigured();
  const premiumPriceCacheKey = 'premium_price_line_cache_v1';
  const normalizeVersion = (value) => {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\.+$/, '');
  };

  const expoVersion = normalizeVersion(
    Constants?.expoConfig?.version || Constants?.manifest?.version
  );
  const nativeVersion = normalizeVersion(
    Application?.nativeApplicationVersion || Constants?.nativeAppVersion
  );

  // Pick the most specific semantic version we can.
  // - Prefer x.y.z over x.y (common mismatch if app.json wasn't bumped).
  // - Avoid showing Expo Go host versions in dev by preferring expoVersion when it already has x.y.z.
  const isSemver2 = (v) => /^\d+\.\d+$/.test(v);
  const isSemver3 = (v) => /^\d+\.\d+\.\d+/.test(v);

  const appVersion = (() => {
    if (isSemver3(expoVersion)) return expoVersion;
    if (isSemver3(nativeVersion) && isSemver2(expoVersion)) return nativeVersion;
    return nativeVersion || expoVersion || 'unknown';
  })();

  if (__DEV__) {
    try {
      addDebugLog({
        source: 'Profile',
        level: 'info',
        message: 'Resolved app version',
        details: JSON.stringify({
          expoVersion,
          nativeVersion,
          appVersion,
          raw_expo_config_version: Constants?.expoConfig?.version || null,
          raw_manifest_version: Constants?.manifest?.version || null,
          raw_native_application_version: Application?.nativeApplicationVersion || null,
          raw_constants_native_app_version: Constants?.nativeAppVersion || null,
        }),
      });
    } catch {
      // Ignore.
    }
  }

  const openExternalLink = async (url) => {
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) {
        Alert.alert('Link unavailable', 'Unable to open this link right now.');
        return;
      }
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Link unavailable', 'Unable to open this link right now.');
    }
  };

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

      if (__DEV__) {
        try {
          addDebugLog({
            source: 'Profile',
            level: 'info',
            message: 'Loaded user profile',
            details: JSON.stringify({
              email: data?.email || null,
              subscription_tier: data?.subscription_tier || null,
              is_premium: data?.is_premium ?? null,
              premium_access_blocked: data?.premium_access_blocked ?? null,
              premium_access_blocked_until: data?.premium_access_blocked_until ?? null,
            }),
          });
        } catch {
          // Ignore debug logger errors.
        }
      }
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

  const ensureRevenueCatUser = useCallback(async () => {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return;

    const profileResponse = await apiFetch(
      `${API_URL}${API_ENDPOINTS.USER_PROFILE}`,
      { headers: { Authorization: `Bearer ${token}` } },
      { onUnauthorized: signOut }
    );

    if (profileResponse.status === 401 || !profileResponse.ok) return;

    const profileData = await profileResponse.json();
    await configureRevenueCat({
      token,
      publicId: profileData?.public_id || null,
      email: profileData?.email || null,
      fullName: profileData?.full_name || null,
    });
  }, [signOut]);

  const loadMealReminders = useCallback(async () => {
    const enabled = await getMealRemindersEnabled();
    setMealRemindersEnabled(enabled);

    // Best-effort: if notifications are enabled already, ensure we have a remote push token
    // for admin broadcasts (does not change local reminder scheduling).
    if (enabled) {
      try {
        const result = await registerExpoPushToken();
        if (!result?.ok) {
          addDebugLog({
            source: 'PushToken',
            level: 'warn',
            message: 'Push token registration failed',
            details: JSON.stringify(result),
          });
        }
      } catch {
        // Ignore.
      }
    }
  }, []);

  const toggleMealReminders = useCallback(
    async (nextEnabled) => {
      if (mealRemindersBusy) return;
      setMealRemindersBusy(true);
      try {
        if (nextEnabled) {
          await setMealRemindersPrompted();
          const result = await enableMealRemindersAndSchedule();
          if (!result?.scheduled) {
            setMealRemindersEnabled(false);
            Alert.alert(
              'Notifications disabled',
              'Please allow notifications in your device Settings to enable meal reminders.',
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
            return;
          }

          // Best-effort: register remote push token for admin broadcasts (does not affect local reminders).
          try {
            const result = await registerExpoPushToken();
            if (!result?.ok) {
              addDebugLog({
                source: 'PushToken',
                level: 'warn',
                message: 'Push token registration failed',
                details: JSON.stringify(result),
              });
              if (__DEV__) {
                const helpText =
                  result?.reason === 'fcm_not_configured'
                    ? 'This Android development build is missing Firebase (FCM) setup required for push tokens. Local reminders still work. To enable admin broadcasts, configure FCM for this app and rebuild, or test with Expo Go.'
                    : 'Notifications are enabled, but the app could not register a push token for admin broadcasts. Open Debug Logs for details.';
                Alert.alert(
                  'Push token not registered',
                  helpText
                );
              }
            }
          } catch {
            // Ignore: user still has local reminders enabled.
          }

          setMealRemindersEnabled(true);
          return;
        }

        await disableMealReminders();
        try {
          await disableExpoPushTokens();
        } catch {
          // Ignore.
        }
        setMealRemindersEnabled(false);
      } catch (error) {
        Alert.alert('Error', 'Unable to update reminders right now.');
      } finally {
        setMealRemindersBusy(false);
      }
    },
    [mealRemindersBusy]
  );

  const openPremiumModal = useCallback(async () => {
    try {
      setIsUpgrading(true);
      setPremiumModalError('');
      setPremiumPriceLine('');
      setPremiumOfferingId('');
      setPremiumProductId('');
      setPremiumModalVisible(true);

      if (!revenueCatReady) {
        setPremiumModalError(
          'Payments are temporarily unavailable in this build. Please update the app or contact support.'
        );
        return;
      }

      // Ensure RevenueCat is configured/logged in before fetching offerings.
      // Without this, `getOfferings()` can fail and the price line won't show.
      try {
        await configureRevenueCat();
        await ensureRevenueCatUser();
      } catch (error) {
        // Ignore and fall back to anonymous offerings fetch.
      }

      let offering = null;
      try {
        offering = await getPaywallOffering();
      } catch (error) {
        const details = `${error?.message || error}`;
        const looksLikeStoreProductConfigIssue =
          details.includes('None of the products registered') ||
          details.includes('offerings-empty') ||
          details.includes('offerings are empty') ||
          details.includes('ConfigurationError');

        setPremiumModalError(
          Platform.OS === 'ios'
            ? looksLikeStoreProductConfigIssue
              ? 'Subscriptions are temporarily unavailable on iOS while our App Store subscription is being reviewed/updated. Please try again later.'
              : 'Subscriptions are temporarily unavailable on iOS right now. Please try again later.'
            : looksLikeStoreProductConfigIssue
              ? 'Subscriptions are temporarily unavailable while our store products are being configured. Please try again later.'
              : 'Subscriptions are temporarily unavailable. Please try again later.'
        );
      }

      if (offering) {
        setPremiumOfferingId(offering?.identifier || '');
        const pkg =
          offering?.availablePackages?.find((p) => p?.identifier === '$rc_monthly') ||
          offering?.availablePackages?.[0] ||
          null;
        const product = pkg?.product || null;
        if (product) {
          const priceString = product?.priceString || product?.price_string || '';
          setPremiumProductId(product?.identifier || product?.productIdentifier || '');
          if (priceString) {
            setPremiumPriceLine(priceString);
            try {
              await AsyncStorage.setItem(premiumPriceCacheKey, priceString);
            } catch (error) {
              // Ignore cache write errors.
            }
          }
        }
      } else {
        try {
          const cachedPrice = await AsyncStorage.getItem(premiumPriceCacheKey);
          if (cachedPrice) setPremiumPriceLine(cachedPrice);
        } catch (error) {
          // Ignore cache read errors.
        }
      }

      // Avoid a second offerings fetch: it can fail transiently and overwrite a successfully loaded price.
    } catch (error) {
      setPremiumModalError('Unable to load subscriptions right now. Please try again later.');
    } finally {
      setIsUpgrading(false);
    }
  }, [ensureRevenueCatUser, revenueCatReady]);

  const handleUpgrade = useCallback(async () => {
    await openPremiumModal();
  }, [openPremiumModal]);

  const handleStartPurchase = async () => {
    try {
      setPremiumModalBusy(true);
      setPremiumModalError('');

      if (!revenueCatReady) {
        setPremiumModalError('Payments are temporarily unavailable in this build.');
        return;
      }

      await ensureRevenueCatUser();

      if (!premiumOfferingId) {
        setPremiumModalError(
          Platform.OS === 'ios'
            ? 'Subscriptions are temporarily unavailable on iOS right now. Please try again later.'
            : 'Subscriptions are temporarily unavailable right now. Please try again later.'
        );
        return;
      }

      const result = await presentPaywall();
      const info = result?.customerInfo ? result.customerInfo : await getCustomerInfo();
      const hasPremium = isPremiumEntitled(info);
      if (hasPremium) {
        await syncSubscription();
        await loadProfile();
        setPremiumModalVisible(false);
        Alert.alert('Success', 'Premium unlocked.');
        return;
      }

      setPremiumModalError('Purchase was not completed.');
    } catch (error) {
      setPremiumModalError(
        'Unable to start subscription right now. If this is a sandbox build, your Paid Apps Agreement may still be processing.'
      );
    } finally {
      setPremiumModalBusy(false);
    }
  };

  const handleRestore = async () => {
    try {
      setPremiumModalBusy(true);
      setPremiumModalError('');

      if (!revenueCatReady) {
        setPremiumModalError('Payments are temporarily unavailable in this build.');
        return;
      }

      await ensureRevenueCatUser();
      const info = await restorePurchases();
      const hasPremium = isPremiumEntitled(info);
      if (hasPremium) {
        await syncSubscription();
        await loadProfile();
        setPremiumModalVisible(false);
        Alert.alert('Restored', 'Your Premium subscription has been restored.');
        return;
      }

      Alert.alert(
        'No purchases found',
        Platform.OS === 'ios'
          ? 'No active Premium subscription was found for this Apple ID.'
          : 'No active Premium subscription was found for this Google Play account.'
      );
    } catch (error) {
      setPremiumModalError('Unable to restore purchases right now. Please try again later.');
    } finally {
      setPremiumModalBusy(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      if (!revenueCatReady) {
        Alert.alert(
          'Payments unavailable',
          'RevenueCat is not configured in this build. Please update the app or contact support.'
        );
        return;
      }
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
      await presentCustomerCenter();
    } catch (error) {
      Alert.alert('Error', 'Unable to open subscription settings right now.');
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadProfile();
      loadMealReminders();
      if (route?.params?.openPremium && !premiumModalVisible) {
        openPremiumModal();
        navigation.setParams({ openPremium: undefined });
      }
    }, [loadMealReminders, loadProfile, navigation, openPremiumModal, premiumModalVisible, route?.params?.openPremium])
  );

  const handleRateUs = async () => {
    const primaryUrl = Platform.OS === 'ios' ? appStoreUrl : playStoreUrl;
    const fallbackUrl = Platform.OS === 'ios' ? appStoreUrl : playStoreWebUrl;

    try {
      await Linking.openURL(primaryUrl);
    } catch (error) {
      try {
        await Linking.openURL(fallbackUrl);
      } catch (fallbackError) {
        Alert.alert('Unavailable', 'Store link not available right now.');
      }
    }
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

  const handleDebugTap = () => {
    if (!__DEV__) return;
    if (debugTapTimer) {
      clearTimeout(debugTapTimer);
    }
    const nextCount = debugTapCount + 1;
    setDebugTapCount(nextCount);
    if (nextCount >= debugTapThreshold) {
      setDebugTapCount(0);
      setDebugTapTimer(null);
      navigation.navigate('DebugLogs');
      return;
    }
    const timer = setTimeout(() => {
      setDebugTapCount(0);
      setDebugTapTimer(null);
    }, 1200);
    setDebugTapTimer(timer);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <Text style={styles.title}>Profile</Text>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1, paddingBottom: versionFooterBottom + versionFooterHeight }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
      <Modal
        visible={premiumModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPremiumModalVisible(false)}
      >
        <View style={styles.premiumModalBackdrop}>
          <View style={styles.premiumModalCard}>
            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.premiumModalScrollContent,
                { paddingBottom: premiumModalBottomPadding + 140 },
              ]}
            >
              <View style={styles.premiumModalHeader}>
                <Text style={styles.premiumModalTitle}>GlucoForager Premium</Text>
                <Pressable onPress={() => setPremiumModalVisible(false)} accessibilityLabel="Close">
                  <Ionicons name="close" size={24} color={Colors.text} />
                </Pressable>
              </View>

              <Text style={styles.premiumModalSubtitle}>Monthly auto-renewable subscription</Text>

              <View style={styles.premiumInfoRow}>
                <Text style={styles.premiumInfoLabel}>Price (per month)</Text>
                <Text
                  style={[
                    styles.premiumInfoValue,
                    !premiumPriceLine && styles.premiumInfoValuePlaceholder,
                  ]}
                >
                  {premiumPriceLine
                    ? `${premiumPriceLine} per month`
                    : Platform.OS === 'ios'
                      ? 'Price shown in App Store during purchase'
                      : 'Price shown in Google Play during purchase'}
                </Text>
              </View>
              <View style={styles.premiumInfoRow}>
                <Text style={styles.premiumInfoLabel}>Length</Text>
                <Text style={styles.premiumInfoValue}>1 month</Text>
              </View>

              <View style={styles.premiumBenefits}>
                <Text style={styles.premiumBenefitsTitle}>What you get:</Text>
                <Text style={styles.premiumBenefitItem}>- Unlimited ingredient scans & searches</Text>
                <Text style={styles.premiumBenefitItem}>- Daily meal planner</Text>
                <Text style={styles.premiumBenefitItem}>- Detailed nutrition insights</Text>
                <Text style={styles.premiumBenefitItem}>- Unlimited favorites</Text>
              </View>

              <Text style={styles.premiumLegalText}>
                {Platform.OS === 'ios'
                  ? 'Payment will be charged to your Apple ID account at confirmation of purchase.'
                  : 'Payment will be charged to your Google Play account at confirmation of purchase.'}{' '}
                Subscription automatically renews unless canceled at least 24 hours before the end of the current period.
                Your account will be charged for renewal within 24 hours prior to the end of the current period.
              </Text>
              <Text style={styles.premiumLegalText}>
                {Platform.OS === 'ios'
                  ? 'Manage or cancel your subscription in Apple ID settings at any time.'
                  : 'Manage or cancel your subscription in Google Play subscriptions at any time.'}
              </Text>

              <View style={styles.premiumLinksRow}>
                <Pressable onPress={() => openExternalLink(privacyPolicyUrl)}>
                  <Text style={styles.premiumLink}>Privacy Policy</Text>
                </Pressable>
                <Text style={styles.premiumLinkSeparator}>|</Text>
                <Pressable onPress={() => openExternalLink(eulaUrl)}>
                  <Text style={styles.premiumLink}>Terms (EULA)</Text>
                </Pressable>
              </View>

              {!!premiumModalError && <Text style={styles.premiumErrorText}>{premiumModalError}</Text>}
            </ScrollView>

            <View style={[styles.premiumActions, { paddingBottom: premiumModalBottomPadding }]}>
              <TouchableOpacity
                style={[styles.premiumButton, styles.premiumButtonPrimary]}
                onPress={handleStartPurchase}
                disabled={premiumModalBusy || !revenueCatReady || !premiumOfferingId}
              >
                {premiumModalBusy ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.premiumButtonTextPrimary}>Continue</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.premiumButton, styles.premiumButtonSecondary]}
                onPress={handleRestore}
                disabled={premiumModalBusy}
              >
                <Text style={styles.premiumButtonTextSecondary}>Restore Purchases</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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

        <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('FoodPreferences')}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="options-outline" size={22} color={Colors.text} />
            <View style={styles.menuTextStack}>
              <Text style={[styles.menuText, { marginLeft: 0, flex: 0 }]}>Food preferences</Text>
              <Text style={styles.menuSubtext}>
                {foodProfileHasPreferences === true ? 'Update your preferences' : 'Personalize your meals (30 seconds)'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={handleManageSubscription}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="card-outline" size={22} color={Colors.text} />
            <Text style={styles.menuText}>Manage Subscription</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
        </TouchableOpacity>

      </View>

      <View style={styles.menuSection}>
        <Text style={styles.sectionTitle}>Notifications</Text>

        <View style={styles.menuItem}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="alarm-outline" size={22} color={Colors.text} />
            <View style={styles.menuTextStack}>
              <Text style={[styles.menuText, { marginLeft: 0, flex: 0 }]}>Enable notifications</Text>
              <Text style={styles.menuSubtext}>Reminders and updates</Text>
            </View>
          </View>
          <Switch
            value={mealRemindersEnabled}
            onValueChange={toggleMealReminders}
            disabled={mealRemindersBusy}
            trackColor={{ false: '#C7CBD1', true: `${Colors.primary}88` }}
            thumbColor={mealRemindersEnabled ? Colors.primary : '#FFFFFF'}
          />
        </View>
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

        </ScrollView>
      </View>

      <TouchableOpacity
        style={[styles.versionContainer, { bottom: versionFooterBottom }]}
        activeOpacity={0.8}
        onPress={__DEV__ ? handleDebugTap : undefined}
      >
        <Text
          style={styles.versionLine}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          GlucoForager v{String(appVersion)}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: 8,
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
  premiumModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  premiumModalCard: {
    backgroundColor: Colors.background,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 0,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    height: '90%',
    position: 'relative',
  },
  premiumModalScrollContent: {
    paddingBottom: 10,
  },
  premiumModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  premiumModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  premiumModalSubtitle: {
    fontSize: 13,
    color: Colors.textLight,
    marginBottom: 12,
  },
  premiumInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 8,
  },
  premiumInfoLabel: {
    fontSize: 13,
    color: Colors.textLight,
    fontWeight: '600',
  },
  premiumInfoValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '700',
  },
  premiumInfoValuePlaceholder: {
    fontSize: 12,
    color: Colors.textLight,
    fontWeight: '700',
  },
  premiumMetaText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  premiumBenefits: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
  },
  premiumBenefitsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
  },
  premiumBenefitItem: {
    fontSize: 13,
    color: Colors.text,
    marginBottom: 4,
  },
  premiumLegalText: {
    marginTop: 10,
    fontSize: 12,
    color: Colors.textLight,
    lineHeight: 16,
  },
  premiumLinksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  premiumLink: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '700',
  },
  premiumLinkSeparator: {
    marginHorizontal: 8,
    fontSize: 12,
    color: Colors.textMuted,
  },
  premiumErrorText: {
    marginTop: 10,
    fontSize: 12,
    color: Colors.error,
    textAlign: 'center',
  },
  premiumActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  premiumButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  premiumButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  premiumButtonSecondary: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border || 'rgba(0,0,0,0.08)',
  },
  premiumButtonTextPrimary: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  premiumButtonTextSecondary: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
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
  menuTextStack: {
    marginLeft: 12,
    flex: 1,
  },
  menuText: {
    fontSize: 16,
    color: Colors.text,
    marginLeft: 12,
    flex: 1,
    flexWrap: 'wrap',
  },
  menuSubtext: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.textLight,
    fontWeight: '500',
  },
  versionContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  versionLine: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    maxWidth: '100%',
  },
});
