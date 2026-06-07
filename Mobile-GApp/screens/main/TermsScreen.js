import React from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TermsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom, 16) + 16;
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primaryDark} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
      >
        <View style={[styles.headerPanel, { paddingTop: headerPaddingTop }]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
              <Ionicons name="arrow-back" size={22} color="white" />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Terms & Conditions</Text>
              <Text style={styles.headerSubtitle}>How GlucoForager works for you</Text>
            </View>
            <View style={styles.headerRight} />
          </View>
        </View>
        <View style={styles.card}>
        <Text style={styles.updated}>Last updated: January 12, 2026</Text>

        <Text style={styles.warning}>⚠️ Important Medical Disclaimer</Text>
        <Text style={styles.paragraph}>
          GlucoForager provides AI-generated recipe suggestions for informational purposes only.
          It is not a medical device and does not provide medical advice, diagnosis, or treatment.
          Always consult with qualified healthcare professionals for personalized medical guidance.
        </Text>

        <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
        <Text style={styles.paragraph}>
          By accessing or using GlucoForager ("the App"), you agree to be bound by these Terms & Conditions.
          If you disagree with any part of these terms, you may not access the App.
        </Text>

        <Text style={styles.sectionTitle}>2. Description of Service</Text>
        <Text style={styles.paragraph}>
          GlucoForager is an AI-powered mobile application that analyzes photos of food ingredients,
          generates diabetes-friendly recipe suggestions, provides meal planning tools for diabetes management,
          and offers basic and premium subscription plans.
        </Text>

        <Text style={styles.sectionTitle}>3. User Accounts</Text>
        <Text style={styles.paragraph}>
          When you create an account with us, you must provide accurate information. You are responsible
          for maintaining the confidentiality of your account, all activities that occur under your account,
          and notifying us immediately of any unauthorized use.
        </Text>

        <Text style={styles.sectionTitle}>4. Subscription Plans</Text>
        <Text style={styles.paragraph}>
          GlucoForager includes a 7-day free trial for new users. After the trial, Premium is required
          to continue using AI-powered scans, ingredient recipe generation, GlucoGuide, meal planning,
          and food swaps. Premium subscriptions automatically renew unless canceled at least 24 hours
          before the end of the current period. You can cancel subscriptions through your app store
          account settings.
        </Text>

        <Text style={styles.sectionTitle}>5. Intellectual Property</Text>
        <Text style={styles.paragraph}>
          The App and its original content, features, and functionality are owned by GlucoForager and are
          protected by international copyright, trademark, and other intellectual property laws.
        </Text>

        <Text style={styles.sectionTitle}>6. User Content</Text>
        <Text style={styles.paragraph}>
          By submitting content (photos, feedback, etc.) to the App, you grant us a non-exclusive,
          worldwide, royalty-free license to use, modify, and display such content for the purpose of
          providing our services. You retain ownership of your food photos, which are processed but not stored.
        </Text>

        <Text style={styles.sectionTitle}>7. Limitation of Liability</Text>
        <Text style={styles.paragraph}>
          To the maximum extent permitted by law, GlucoForager shall not be liable for any indirect,
          incidental, or consequential damages, loss of data or profits, health outcomes resulting from
          recipe suggestions, or inaccuracies in AI-generated content.
        </Text>

        <Text style={styles.sectionTitle}>8. Termination</Text>
        <Text style={styles.paragraph}>
          We may terminate or suspend your account immediately, without prior notice, for conduct that
          we believe violates these Terms or is harmful to other users, us, or third parties.
        </Text>

        <Text style={styles.sectionTitle}>9. Governing Law</Text>
        <Text style={styles.paragraph}>
          These Terms shall be governed by and construed in accordance with the laws of England and Wales.
          Any disputes relating to these terms will be subject to the exclusive jurisdiction of the courts
          of England and Wales.
        </Text>

        <Text style={styles.sectionTitle}>10. Changes to Terms</Text>
        <Text style={styles.paragraph}>
          We reserve the right to modify these terms at any time. We will provide notice of significant
          changes through the App or via email.
        </Text>

        <Text style={styles.sectionTitle}>11. Contact Information</Text>
        <Text style={styles.paragraph}>hello@glucoforager.com</Text>
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
    paddingBottom: 24,
  },
  headerPanel: {
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
    marginBottom: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  headerRight: {
    width: 36,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: 'white',
  },
  headerSubtitle: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.78)',
  },
  card: {
    backgroundColor: Colors.surface,
    marginHorizontal: 20,
    marginBottom: 30,
    borderRadius: 16,
    padding: 20,
  },
  updated: {
    color: Colors.textLight,
    fontSize: 12,
    marginBottom: 10,
  },
  warning: {
    color: Colors.error,
    fontWeight: '700',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 14,
    marginBottom: 6,
  },
  paragraph: {
    color: Colors.textLight,
    fontSize: 14,
    lineHeight: 20,
  },
});
