import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PrivacyPolicyScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom, 16) + 16;
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
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
              <Text style={styles.headerTitle}>Privacy Policy</Text>
              <Text style={styles.headerSubtitle}>How we protect your information</Text>
            </View>
            <View style={styles.headerRight} />
          </View>
        </View>
        <View style={styles.card}>
        <Text style={styles.updated}>Last updated: January 12, 2026</Text>

        <Text style={styles.sectionTitle}>1. Introduction</Text>
        <Text style={styles.paragraph}>
          Welcome to GlucoForager ("we," "our," or "us"). We are committed to protecting your personal
          information and your right to privacy. This Privacy Policy explains how we collect, use,
          disclose, and safeguard your information when you use our mobile application and services.
        </Text>
        <Text style={styles.paragraph}>
          Please read this privacy policy carefully. If you do not agree with the terms of this
          privacy policy, please do not access the application.
        </Text>

        <Text style={styles.sectionTitle}>2. Information We Collect</Text>
        <Text style={styles.subTitle}>Personal Information</Text>
        <Text style={styles.paragraph}>
          When you use GlucoForager, we may collect: Email address (if you choose to create an account),
          name (optional), dietary preferences and restrictions, and recipe preferences and saved recipes.
        </Text>
        <Text style={styles.subTitle}>Automatically Collected Information</Text>
        <Text style={styles.paragraph}>
          We may automatically collect device information (type, operating system, unique device identifiers),
          usage data (features used, time spent in app), and app performance data (crash reports, errors).
        </Text>

        <Text style={styles.sectionTitle}>3. How We Use Your Information</Text>
        <Text style={styles.paragraph}>
          We use the information we collect to provide and maintain our services, personalize your
          experience with diabetes-friendly recipe suggestions, improve our AI algorithms and app
          functionality, communicate with you about updates, features, and offers, ensure app security
          and prevent fraud, and comply with legal obligations.
        </Text>

        <Text style={styles.sectionTitle}>4. Photo Processing</Text>
        <Text style={styles.paragraph}>
          When you use our AI food recognition feature, food photos are processed in real-time by our
          AI service providers (OpenAI/DeepSeek). We do not store your food photos on our servers.
          Photos are deleted immediately after processing. Only the detected ingredients are used to
          generate recipe suggestions.
        </Text>

        <Text style={styles.sectionTitle}>5. Data Security</Text>
        <Text style={styles.paragraph}>
          We implement appropriate technical and organizational security measures to protect your personal
          information. However, no method of electronic transmission or storage is 100% secure, and we
          cannot guarantee absolute security.
        </Text>

        <Text style={styles.sectionTitle}>6. Your Rights (GDPR & UK GDPR)</Text>
        <Text style={styles.paragraph}>
          You have the right of access, rectification, erasure, restriction of processing, data portability,
          and objection. To exercise these rights, contact us at hello@glucoforager.com. We will respond
          within one month.
        </Text>

        <Text style={styles.sectionTitle}>7. Children&apos;s Privacy</Text>
        <Text style={styles.paragraph}>
          Our services are not intended for individuals under 18 years of age. We do not knowingly collect
          personal information from children. If you are a parent or guardian and believe your child has
          provided us with personal information, please contact us.
        </Text>

        <Text style={styles.sectionTitle}>8. Changes to This Policy</Text>
        <Text style={styles.paragraph}>
          We may update this Privacy Policy from time to time. We will notify you of any changes by
          posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date.
        </Text>

        <Text style={styles.sectionTitle}>9. Contact Us</Text>
        <Text style={styles.paragraph}>
          Email: hello@glucoforager.com
        </Text>
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 14,
    marginBottom: 6,
  },
  subTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 8,
    marginBottom: 4,
  },
  paragraph: {
    color: Colors.textLight,
    fontSize: 14,
    lineHeight: 20,
  },
});
