// screens/main/CarbGoalScreen.js
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { apiFetch } from '../../utils/api';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { useAuth } from '../../context/authContext';
import CarbGoalRing, { getCarbGoalRingColor } from '../../components/CarbGoalRing';
import { getCarbGoalTitle, getCarbGoalSubtitle, getCarbGoalDisclaimer } from '../../utils/carbGoal';

const GOAL_RANGE = { min: 20, max: 400 };

export default function CarbGoalScreen() {
  const navigation = useNavigation();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState(null);
  const [hasOverride, setHasOverride] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const loadData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const localMidnight = new Date();
      localMidnight.setHours(0, 0, 0, 0);
      const [summaryRes, profileRes] = await Promise.all([
        apiFetch(
          `${API_URL}/api/app/health-log/today?local_day_start=${encodeURIComponent(localMidnight.toISOString())}`,
          { headers: { Authorization: `Bearer ${token}` } },
          { onUnauthorized: signOut }
        ),
        apiFetch(
          `${API_URL}${API_ENDPOINTS.USER_PROFILE}`,
          { headers: { Authorization: `Bearer ${token}` } },
          { onUnauthorized: signOut }
        ),
      ]);

      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary(data);
        setInputValue(data?.carb_goal_g != null ? String(data.carb_goal_g) : '');
      }
      if (profileRes.ok) {
        const profile = await profileRes.json();
        setHasOverride(profile?.daily_carb_goal_g != null);
      }
    } catch {
      // ignore network errors, screen just shows last-known/empty state
    } finally {
      setLoading(false);
    }
  }, [signOut]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const carbsLoggedToday = summary?.carbs_logged_today_g ?? null;
  const carbGoalMode = summary?.carb_goal_mode || 'ceiling';
  const carbGoalToday = summary?.carb_goal_g || (carbGoalMode === 'none' ? null : 130);
  const mealsLoggedToday = summary?.meals_logged_today || 0;

  const title = getCarbGoalTitle({ carbsLoggedToday, carbGoalToday, carbGoalMode, mealsLoggedToday });
  const subtitle = getCarbGoalSubtitle({ carbsLoggedToday, carbGoalToday, carbGoalMode });

  const saveTarget = async (rawValue) => {
    if (saving) return;
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in again.');
        return;
      }
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.USER_PROFILE}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ daily_carb_goal_g: rawValue }),
        },
        { onUnauthorized: signOut }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        Alert.alert('Unable to save', data?.detail?.message || data?.detail || 'Please try again.');
        return;
      }
      await loadData();
    } catch {
      Alert.alert('Unable to save', 'Network request failed. Please check your connection.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    const parsed = parseInt(inputValue, 10);
    if (!Number.isFinite(parsed) || parsed < GOAL_RANGE.min || parsed > GOAL_RANGE.max) {
      Alert.alert('Check the target', `Enter a target between ${GOAL_RANGE.min}g and ${GOAL_RANGE.max}g.`);
      return;
    }
    saveTarget(parsed);
  };

  const handleUseSuggested = () => {
    saveTarget(0);
  };

  const showDisclaimer = () => {
    Alert.alert('About your carb target', getCarbGoalDisclaimer(carbGoalMode, carbGoalToday));
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[styles.headerPanel, { paddingTop: headerPaddingTop }]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
              <Ionicons name="arrow-back" size={22} color="white" />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Carb goal</Text>
              <Text style={styles.headerSubtitle}>Your daily target and today's progress</Text>
            </View>
            <View style={{ width: 44 }} />
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <View style={styles.content}>
            <View style={styles.ringCard}>
              <CarbGoalRing carbsLogged={carbsLoggedToday} carbGoal={carbGoalToday} mode={carbGoalMode} size={140} />
              <Text style={styles.ringTitle}>{title}</Text>
              <Text
                style={[
                  styles.ringSubtitle,
                  { color: getCarbGoalRingColor(carbsLoggedToday, carbGoalToday, carbGoalMode) },
                ]}
              >
                {subtitle}
              </Text>
              <TouchableOpacity style={styles.disclaimerRow} onPress={showDisclaimer} activeOpacity={0.7}>
                <Ionicons name="information-circle-outline" size={14} color={Colors.textLight} />
                <Text style={styles.disclaimerRowText}>Where this number comes from</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Set your own daily target</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.targetInput}
                placeholder="e.g. 150"
                placeholderTextColor={Colors.textMuted}
                value={inputValue}
                onChangeText={(text) => setInputValue(text.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Text style={styles.inputUnit}>g / day</Text>
            </View>
            <Text style={styles.hint}>
              Enter a number between {GOAL_RANGE.min}g and {GOAL_RANGE.max}g. This is a general planning tool, not
              medical advice - use a number from your doctor or diabetes care team if you have one.
            </Text>

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.9}
            >
              <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save target'}</Text>
            </TouchableOpacity>

            {hasOverride ? (
              <TouchableOpacity
                style={[styles.suggestedButton, saving && styles.saveButtonDisabled]}
                onPress={handleUseSuggested}
                disabled={saving}
                activeOpacity={0.7}
              >
                <Text style={styles.suggestedButtonText}>Use suggested default instead</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerPanel: {
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: { flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: 'white' },
  headerSubtitle: { marginTop: 3, fontSize: 12, color: 'rgba(255,255,255,0.78)', fontWeight: '700' },
  loadingBox: { paddingTop: 60, alignItems: 'center' },
  content: { padding: 20 },
  ringCard: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  ringTitle: { marginTop: 16, fontSize: 17, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  ringSubtitle: { marginTop: 4, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  disclaimerRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 5 },
  disclaimerRowText: { fontSize: 12, fontWeight: '700', color: Colors.textLight, textDecorationLine: 'underline' },
  label: { fontSize: 15, fontWeight: '800', color: Colors.text, marginBottom: 10 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
  },
  targetInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
  },
  inputUnit: { fontSize: 14, fontWeight: '700', color: Colors.textLight },
  hint: { marginTop: 10, fontSize: 12, lineHeight: 18, color: Colors.textLight, fontWeight: '600' },
  saveButton: {
    marginTop: 20,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: 'white', fontSize: 15, fontWeight: '800' },
  suggestedButton: {
    marginTop: 12,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestedButtonText: { color: Colors.secondary, fontSize: 13.5, fontWeight: '800' },
});
