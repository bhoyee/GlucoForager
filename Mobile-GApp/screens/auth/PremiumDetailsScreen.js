// screens/auth/PremiumDetailsScreen.js
// Logged-out "See Premium details": what's free vs Premium, the price and the store
// subscription terms. Actions sit in a footer above the system navigation bar.
import React, { useEffect, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import BrandWordmark from '../../components/BrandWordmark';
import { getPaywallOffering, isRevenueCatConfigured } from '../../utils/revenuecat';

// Free allowances are admin-editable, so the free column describes them without numbers.
const ROWS = [
  { label: 'Barcode scans & food verdicts', free: 'yes', premium: 'yes' },
  { label: 'Glucose & meal logging', free: 'yes', premium: 'yes' },
  { label: 'Daily tips, challenges & favourites', free: 'yes', premium: 'yes' },
  { label: 'GlucoGuide AI questions', free: 'Weekly free uses', premium: 'No weekly limit' },
  { label: 'Fridge scans & recipe ideas', free: 'Weekly free uses', premium: 'No weekly limit' },
  { label: 'Food photo scans & swaps', free: 'Weekly free uses', premium: 'No weekly limit' },
  { label: 'Daily meal planner', free: 'no', premium: 'yes' },
];

function Cell({ value, premium }) {
  if (value === 'yes') {
    return <Ionicons name="checkmark-circle" size={20} color={premium ? Colors.primary : Colors.success} />;
  }
  if (value === 'no') return <Ionicons name="remove" size={20} color={Colors.textMuted} />;
  return (
    <Text style={[styles.cellText, premium && styles.cellTextPremium]} numberOfLines={2}>
      {value}
    </Text>
  );
}

export default function PremiumDetailsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [priceLine, setPriceLine] = useState('');

  const privacyPolicyUrl = 'https://www.glucoforager.com/privacy-policy';
  const eulaUrl =
    Platform.OS === 'ios'
      ? 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
      : 'https://play.google.com/about/play-terms/';
  const storeName = Platform.OS === 'ios' ? 'Apple ID' : 'Google Play';

  const openExternalLink = async (url) => {
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) {
        Alert.alert('Link unavailable', 'Unable to open this link right now.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Link unavailable', 'Unable to open this link right now.');
    }
  };

  useEffect(() => {
    let alive = true;
    const loadPrice = async () => {
      if (!isRevenueCatConfigured()) return;
      try {
        const tryLoad = async () => {
          const offering = await getPaywallOffering();
          const pkg =
            offering?.availablePackages?.find((p) => p?.identifier === '$rc_monthly') ||
            offering?.availablePackages?.[0] ||
            null;
          const product = pkg?.product || null;
          return product?.priceString || product?.price_string || '';
        };
        let priceString = await tryLoad();
        if (!priceString) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          priceString = await tryLoad();
        }
        if (alive && priceString) setPriceLine(priceString);
      } catch {
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
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 6 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={Colors.brandNavy} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Premium details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <BrandWordmark size={26} />
          <Text style={styles.heroTitle}>Premium</Text>
          <Text style={styles.heroSub}>Everything unlocked, with no weekly limits.</Text>
        </View>

        <View style={styles.table}>
          <View style={[styles.row, styles.headRow]}>
            <Text style={[styles.rowLabel, styles.headLabel]}>Feature</Text>
            <Text style={styles.headCol}>Free</Text>
            <Text style={[styles.headCol, styles.headColPremium]}>Premium</Text>
          </View>
          {ROWS.map((row, i) => (
            <View key={row.label} style={[styles.row, i === ROWS.length - 1 && styles.rowLast]}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <View style={styles.col}>
                <Cell value={row.free} />
              </View>
              <View style={[styles.col, styles.colPremium]}>
                <Cell value={row.premium} premium />
              </View>
            </View>
          ))}
        </View>
        <Text style={styles.footnote}>Free uses refresh every Monday.</Text>

        <View style={styles.priceCard}>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Price</Text>
            <Text style={[styles.priceValue, !priceLine && styles.priceValuePlaceholder]}>
              {priceLine ? `${priceLine} / month` : `Shown on ${storeName} before you pay`}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Billing</Text>
            <Text style={styles.priceValue}>Monthly · cancel anytime</Text>
          </View>
        </View>

        <Text style={styles.legal}>
          Payment is charged to your {storeName} account at confirmation of purchase. The subscription renews
          automatically unless canceled at least 24 hours before the end of the current period, and your account is
          charged for renewal within 24 hours before the period ends. Manage or cancel anytime in your {storeName}{' '}
          subscription settings.
        </Text>

        <View style={styles.linksRow}>
          <TouchableOpacity onPress={() => openExternalLink(privacyPolicyUrl)}>
            <Text style={styles.link}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={styles.separator}>|</Text>
          <TouchableOpacity onPress={() => openExternalLink(eulaUrl)}>
            <Text style={styles.link}>Terms (EULA)</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Always visible, above the phone's navigation bar. */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('SignUp')} activeOpacity={0.88}>
          <Text style={styles.primaryButtonText}>Create free account</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.signInRow} onPress={() => navigation.navigate('Login')} hitSlop={8}>
          <Text style={styles.signInText}>
            Already have an account? <Text style={styles.signInLink}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.brandCream },
  header: { paddingHorizontal: 16, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#E9ECE4', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.brandNavy },
  headerSpacer: { width: 40, height: 40 },
  content: { paddingHorizontal: 18, paddingBottom: 20 },
  hero: { alignItems: 'center', marginTop: 4, marginBottom: 16 },
  heroTitle: { fontSize: 15, fontWeight: '900', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 2 },
  heroSub: { fontSize: 14, color: Colors.textLight, marginTop: 6, textAlign: 'center' },
  table: { backgroundColor: 'white', borderRadius: 18, borderWidth: 1, borderColor: '#E9ECE4', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, minHeight: 50, borderBottomWidth: 1, borderBottomColor: '#F1F1EC' },
  rowLast: { borderBottomWidth: 0 },
  headRow: { minHeight: 40, backgroundColor: '#F7F8F4' },
  rowLabel: { flex: 1.5, fontSize: 13, fontWeight: '700', color: Colors.brandNavy, paddingVertical: 8, paddingRight: 6 },
  headLabel: { fontSize: 12, color: Colors.textLight, fontWeight: '800', textTransform: 'uppercase' },
  headCol: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '900', color: Colors.textLight, textTransform: 'uppercase' },
  headColPremium: { color: Colors.primary },
  col: { flex: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', paddingVertical: 8, paddingHorizontal: 6 },
  colPremium: { backgroundColor: 'rgba(29,124,122,0.06)' },
  cellText: { fontSize: 11.5, fontWeight: '700', color: Colors.textLight, textAlign: 'center' },
  cellTextPremium: { color: Colors.primary, fontWeight: '800' },
  footnote: { fontSize: 12, color: Colors.textLight, marginTop: 8, marginLeft: 4 },
  priceCard: { marginTop: 16, backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: '#E9ECE4', paddingHorizontal: 14 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  priceLabel: { fontSize: 13, color: Colors.textLight, fontWeight: '700' },
  priceValue: { fontSize: 14, color: Colors.brandNavy, fontWeight: '900', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  priceValuePlaceholder: { fontSize: 12.5, color: Colors.textLight, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#F1F1EC' },
  legal: { marginTop: 14, fontSize: 11.5, color: Colors.textLight, lineHeight: 17 },
  linksRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  link: { fontSize: 12.5, color: Colors.primary, fontWeight: '800' },
  separator: { marginHorizontal: 8, fontSize: 12, color: Colors.textMuted },
  footer: { paddingHorizontal: 18, paddingTop: 12, backgroundColor: Colors.brandCream, borderTopWidth: 1, borderTopColor: '#ECEDE5' },
  primaryButton: { backgroundColor: Colors.primary, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: 'white', fontSize: 16, fontWeight: '900' },
  signInRow: { alignItems: 'center', paddingVertical: 10 },
  signInText: { fontSize: 13.5, color: Colors.textLight },
  signInLink: { color: Colors.primary, fontWeight: '900' },
});
