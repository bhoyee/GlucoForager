import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { apiFetch } from '../../utils/api';
import { API_URL } from '../../config/api';

const UNIT_PREF_KEY = 'glucose_unit_pref_v1';
const MGDL_PER_MMOL = 18.0182;
const MGDL_RANGE = { min: 20, max: 600 };
const MMOL_RANGE = { min: 1.1, max: 33.3 };

export default function LogGlucoseScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);

  const [unit, setUnit] = useState('mg/dL');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(UNIT_PREF_KEY)
      .then((stored) => {
        if (stored === 'mg/dL' || stored === 'mmol/L') setUnit(stored);
      })
      .catch(() => {});
  }, []);

  const switchUnit = (nextUnit) => {
    if (nextUnit === unit) return;
    setUnit(nextUnit);
    setValue('');
    AsyncStorage.setItem(UNIT_PREF_KEY, nextUnit).catch(() => {});
  };

  const handleValueChange = (text) => {
    if (unit === 'mmol/L') {
      let cleaned = text.replace(/[^0-9.]/g, '');
      const firstDot = cleaned.indexOf('.');
      if (firstDot !== -1) {
        cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
      }
      setValue(cleaned);
    } else {
      setValue(text.replace(/[^0-9]/g, ''));
    }
  };

  const handleSave = async () => {
    const raw = parseFloat(value);
    const range = unit === 'mmol/L' ? MMOL_RANGE : MGDL_RANGE;
    if (!Number.isFinite(raw) || raw < range.min || raw > range.max) {
      Alert.alert(
        'Check the reading',
        `Enter your glucose reading in ${unit} (between ${range.min} and ${range.max}).`
      );
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to log a reading.');
        return;
      }
      const valueMgDl = unit === 'mmol/L' ? Math.round(raw * MGDL_PER_MMOL) : Math.round(raw);
      const response = await apiFetch(
        `${API_URL}/api/app/glucose`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ value_mg_dl: valueMgDl, note: note.trim() || undefined }),
        },
        { timeoutMs: 8000 }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        Alert.alert('Unable to log reading', data?.detail?.message || data?.detail || 'Please try again.');
        return;
      }
      const data = await response.json();
      if (data?.is_spike && data?.flagged_meal) {
        Alert.alert(
          'Reading logged',
          `This is higher than usual, and follows "${data.flagged_meal.description}" - worth keeping an eye on if it happens again.`,
          [{ text: 'Got it', onPress: () => navigation.goBack() }]
        );
        return;
      }
      navigation.goBack();
    } catch {
      Alert.alert('Unable to log reading', 'Network request failed. Please check your connection.');
    } finally {
      setIsSaving(false);
    }
  };

  const spikeHint =
    unit === 'mmol/L'
      ? `${(180 / MGDL_PER_MMOL).toFixed(1)} mmol/L`
      : '180 mg/dL';

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[styles.headerPanel, { paddingTop: headerPaddingTop }]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
              <Ionicons name="arrow-back" size={22} color="white" />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Log glucose</Text>
              <Text style={styles.headerSubtitle}>Logged as right now</Text>
            </View>
            <View style={{ width: 44 }} />
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Reading</Text>
            <View style={styles.unitSwitcher}>
              <TouchableOpacity
                style={[styles.unitOption, unit === 'mg/dL' && styles.unitOptionActive]}
                onPress={() => switchUnit('mg/dL')}
              >
                <Text style={[styles.unitOptionText, unit === 'mg/dL' && styles.unitOptionTextActive]}>mg/dL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.unitOption, unit === 'mmol/L' && styles.unitOptionActive]}
                onPress={() => switchUnit('mmol/L')}
              >
                <Text style={[styles.unitOptionText, unit === 'mmol/L' && styles.unitOptionTextActive]}>mmol/L</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TextInput
            style={styles.valueInput}
            placeholder={unit === 'mmol/L' ? 'e.g. 7.9' : 'e.g. 142'}
            placeholderTextColor={Colors.textMuted}
            value={value}
            onChangeText={handleValueChange}
            keyboardType="decimal-pad"
            maxLength={unit === 'mmol/L' ? 5 : 3}
            autoFocus
          />

          <Text style={[styles.label, { marginTop: 20 }]}>Note (optional)</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="e.g. Before lunch, felt fine"
            placeholderTextColor={Colors.textMuted}
            value={note}
            onChangeText={setNote}
            multiline
          />

          <Text style={styles.hint}>
            If this follows a logged meal by 30 minutes to 3 hours and reads {spikeHint} or higher, we'll flag
            that meal so you can spot patterns over time.
          </Text>

          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.9}
          >
            <Text style={styles.saveButtonText}>{isSaving ? 'Logging...' : 'Log reading'}</Text>
          </TouchableOpacity>
        </View>
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
  content: { padding: 20 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  label: { fontSize: 15, fontWeight: '800', color: Colors.text },
  unitSwitcher: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unitOption: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  unitOptionActive: { backgroundColor: Colors.primary },
  unitOptionText: { fontSize: 12, fontWeight: '800', color: Colors.textLight },
  unitOptionTextActive: { color: 'white' },
  valueInput: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
  },
  noteInput: {
    minHeight: 64,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.text,
    textAlignVertical: 'top',
  },
  hint: { marginTop: 14, fontSize: 12, lineHeight: 18, color: Colors.textLight, fontWeight: '600' },
  saveButton: {
    marginTop: 24,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: 'white', fontSize: 15, fontWeight: '800' },
});
