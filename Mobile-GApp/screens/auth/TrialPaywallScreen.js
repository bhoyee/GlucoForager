import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/authContext';
import {
  getCustomerInfo,
  isPremiumEntitled,
  isRevenueCatConfigured,
  presentPaywall,
  restorePurchases,
} from '../../utils/revenuecat';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function TrialPaywallScreen() {
  const insets = useSafeAreaInsets();
  const { refreshUserProfile, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const revenueCatReady = isRevenueCatConfigured();

  const refreshAccessWithRetry = useCallback(async () => {
    const delays = [0, 1200, 2500, 4000];
    for (const delay of delays) {
      if (delay) await wait(delay);
      const profile = await refreshUserProfile();
      if (profile?.has_feature_access === true || profile?.subscription_tier === 'premium') {
        return true;
      }
    }
    return false;
  }, [refreshUserProfile]);

  const handleStartTrial = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (!revenueCatReady) {
        setMessage('Payments are temporarily unavailable in this build. Please update the app or contact support.');
        return;
      }

      const result = await presentPaywall();
      const info = result?.customerInfo ? result.customerInfo : await getCustomerInfo();
      if (!isPremiumEntitled(info)) {
        setMessage('Trial was not started. Please complete the store confirmation to continue.');
        return;
      }

      setMessage('Trial confirmed. Unlocking your account...');
      const hasAccess = await refreshAccessWithRetry();
      if (!hasAccess) {
        setMessage('Your trial is confirmed. We are still syncing access. Please tap Check access in a moment.');
      }
    } catch (error) {
      setMessage(
        Platform.OS === 'ios'
          ? 'Unable to start the trial right now. Please check your App Store subscription setup and try again.'
          : 'Unable to start the trial right now. Please check Google Play and try again.'
      );
    } finally {
      setBusy(false);
    }
  }, [busy, refreshAccessWithRetry, revenueCatReady]);

  const handleRestore = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (!revenueCatReady) {
        setMessage('Payments are temporarily unavailable in this build.');
        return;
      }

      const info = await restorePurchases();
      if (!isPremiumEntitled(info)) {
        setMessage('No active trial or subscription was found for this store account.');
        return;
      }

      setMessage('Purchase restored. Checking access...');
      const hasAccess = await refreshAccessWithRetry();
      if (!hasAccess) {
        setMessage('Purchase restored. We are still syncing access. Please tap Check access in a moment.');
      }
    } catch (error) {
      setMessage('Unable to restore purchases right now. Please try again later.');
    } finally {
      setBusy(false);
    }
  }, [busy, refreshAccessWithRetry, revenueCatReady]);

  const handleCheckAccess = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessage('Checking your access...');
    try {
      const hasAccess = await refreshAccessWithRetry();
      if (!hasAccess) {
        setMessage('No active trial or subscription is linked to this account yet.');
      }
    } finally {
      setBusy(false);
    }
  }, [busy, refreshAccessWithRetry]);

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign out?', 'You can sign in again with another account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }, [signOut]);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 18) + 18, paddingBottom: Math.max(insets.bottom, 18) + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoMark}>
          <Ionicons name="leaf-outline" size={38} color={Colors.primary} />
        </View>

        <Text style={styles.kicker}>GlucoForager Premium</Text>
        <Text style={styles.title}>Start your 7-day free trial</Text>
        <Text style={styles.subtitle}>
          Unlock diabetes-friendly scans, typed ingredient recipes, food swaps, meal planning, GlucoGuide AI, favorites, and history.
        </Text>

        <View style={styles.card}>
          {[
            'Scan your fridge or pantry',
            'Type ingredients and generate recipes',
            'Get food swaps for meals, snacks, and drinks',
            'Plan meals around your diabetes profile',
            'Ask GlucoGuide AI when you are unsure',
          ].map((item) => (
            <View key={item} style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
              <Text style={styles.benefitText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.storeNote}>
          <Ionicons name="card-outline" size={18} color={Colors.textLight} />
          <Text style={styles.storeNoteText}>
            Trial and billing are managed securely by {Platform.OS === 'ios' ? 'Apple' : 'Google Play'}.
          </Text>
        </View>

        {!!message && (
          <View style={styles.messageBox}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 14) + 14 }]}>
        <TouchableOpacity
          style={[styles.primaryButton, busy && styles.disabledButton]}
          onPress={handleStartTrial}
          disabled={busy}
          activeOpacity={0.88}
        >
          {busy ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>Start 7-day free trial</Text>
              <Ionicons name="arrow-forward" size={19} color="white" />
            </>
          )}
        </TouchableOpacity>

        <View style={styles.secondaryRow}>
          <Pressable onPress={handleRestore} disabled={busy} style={styles.linkButton}>
            <Text style={styles.linkText}>Restore</Text>
          </Pressable>
          <Text style={styles.dot}>•</Text>
          <Pressable onPress={handleCheckAccess} disabled={busy} style={styles.linkButton}>
            <Text style={styles.linkText}>Check access</Text>
          </Pressable>
          <Text style={styles.dot}>•</Text>
          <Pressable onPress={handleSignOut} disabled={busy} style={styles.linkButton}>
            <Text style={styles.linkText}>Sign out</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 22,
  },
  logoMark: {
    width: 74,
    height: 74,
    borderRadius: 24,
    backgroundColor: '#EAF7EF',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 18,
  },
  kicker: {
    textAlign: 'center',
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 8,
  },
  title: {
    color: Colors.text,
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 36,
  },
  subtitle: {
    marginTop: 12,
    color: Colors.textLight,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  card: {
    marginTop: 24,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  benefitText: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  storeNote: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F7FAFC',
    borderRadius: 14,
    padding: 12,
  },
  storeNoteText: {
    flex: 1,
    color: Colors.textLight,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  messageBox: {
    marginTop: 14,
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  messageText: {
    color: '#9A3412',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  actions: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  linkButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  linkText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  dot: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
});
