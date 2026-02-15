// screens/auth/PremiumDetailsScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { getPaywallOffering, isRevenueCatConfigured } from '../../utils/revenuecat';

export default function PremiumDetailsScreen() {
  const navigation = useNavigation();

  const privacyPolicyUrl = 'https://www.glucoforager.com/privacy-policy';
  const eulaUrl = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
  const [priceLine, setPriceLine] = useState('');

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

  useEffect(() => {
    let alive = true;

    const loadPrice = async () => {
      if (!isRevenueCatConfigured()) return;
      try {
        const offering = await getPaywallOffering();
        const pkg =
          offering?.availablePackages?.find((p) => p?.identifier === '$rc_monthly') ||
          offering?.availablePackages?.[0] ||
          null;
        const product = pkg?.product || null;
        const priceString = product?.priceString || product?.price_string || '';
        if (alive && priceString) setPriceLine(priceString);
      } catch (error) {
        // Keep fallback text if offerings aren't available yet.
      }
    };

    loadPrice();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Premium Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>GlucoForager Premium</Text>
        <Text style={styles.subtitle}>Monthly auto-renewable subscription</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What you get</Text>
          <Text style={styles.bullet}>- Unlimited ingredient scans and searches</Text>
          <Text style={styles.bullet}>- Diabetes-friendly recipe suggestions</Text>
          <Text style={styles.bullet}>- Detailed nutrition insights</Text>
          <Text style={styles.bullet}>- Unlimited favorites</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Subscription length</Text>
          <Text style={styles.infoValue}>1 month</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Price (per month)</Text>
          <Text style={styles.infoValue}>
            {priceLine ? `${priceLine} / month` : 'Price shown on Apple purchase confirmation'}
          </Text>
        </View>

        <Text style={styles.legal}>
          Payment will be charged to your Apple ID account at confirmation of purchase. Subscription
          automatically renews unless canceled at least 24 hours before the end of the current period. Your
          account will be charged for renewal within 24 hours prior to the end of the current period.
        </Text>
        <Text style={styles.legal}>Manage or cancel your subscription in Apple ID settings at any time.</Text>

        <View style={styles.linksRow}>
          <TouchableOpacity onPress={() => openExternalLink(privacyPolicyUrl)}>
            <Text style={styles.link}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={styles.separator}>|</Text>
          <TouchableOpacity onPress={() => openExternalLink(eulaUrl)}>
            <Text style={styles.link}>Terms (EULA)</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>Sign in to continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  headerSpacer: {
    width: 38,
    height: 38,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  title: {
    marginTop: 6,
    fontSize: 24,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: Colors.textLight,
    textAlign: 'center',
    marginBottom: 16,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 8,
  },
  bullet: {
    fontSize: 13,
    color: Colors.text,
    marginBottom: 6,
    lineHeight: 18,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: Colors.textLight,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '800',
  },
  legal: {
    marginTop: 10,
    fontSize: 12,
    color: Colors.textLight,
    lineHeight: 16,
  },
  linksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  link: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '800',
  },
  separator: {
    marginHorizontal: 8,
    fontSize: 12,
    color: Colors.textMuted,
  },
  primaryButton: {
    marginTop: 18,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
