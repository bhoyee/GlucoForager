// screens/main/GlucoseTargetsScreen.js
// "My targets": the glucose ranges the Home "Track today" card measures readings against.
// Defaults are the ADA general targets for adults; users set what their care team agreed.
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { API_URL } from '../../config/api';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../context/authContext';
import { formatGlucose, fromUnitValue, getGlucoseUnit, setGlucoseUnit, toUnitValue } from '../../utils/glucose';

const UNITS = ['mg/dL', 'mmol/L'];

const ENDPOINT = '/api/app/health-log/glucose-targets';
const FIELDS = [
  { key: 'premeal_low', label: 'Before meals: lowest', hint: 'Fasting and before eating' },
  { key: 'premeal_high', label: 'Before meals: highest', hint: 'Fasting and before eating' },
  { key: 'postmeal_high', label: 'After meals: stay below', hint: '1-2 hours after eating' },
];

export default function GlucoseTargetsScreen() {
  const navigation = useNavigation();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [unit, setUnit] = useState('mg/dL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [targets, setTargets] = useState(null);
  const [values, setValues] = useState({});

  const toInputs = (t, u) =>
    Object.fromEntries(FIELDS.map(({ key }) => [key, String(toUnitValue(t[key], u))]));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const u = await getGlucoseUnit();
      setUnit(u);
      const token = await AsyncStorage.getItem('userToken');
      const res = await apiFetch(
        `${API_URL}${ENDPOINT}`,
        { headers: { Authorization: `Bearer ${token}` } },
        { onUnauthorized: signOut, timeoutMs: 12000 }
      );
      if (res.ok) {
        const data = await res.json();
        setTargets(data);
        setValues(toInputs(data, u));
      }
    } finally {
      setLoading(false);
    }
  }, [signOut]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const request = async (method, body) => {
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await apiFetch(
        `${API_URL}${ENDPOINT}`,
        {
          method,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        },
        { onUnauthorized: signOut, timeoutMs: 12000 }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert('Check your targets', data?.detail?.message || 'Unable to save targets. Please try again.');
        return;
      }
      setTargets(data);
      setValues(toInputs(data, unit));
      Alert.alert('Saved', method === 'DELETE' ? 'Targets reset to the standard ranges.' : 'Your targets are saved.');
    } catch {
      Alert.alert('Network error', 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleUnitChange = (nextUnit) => {
    if (nextUnit === unit) return;
    setValues((current) =>
      Object.fromEntries(
        FIELDS.map(({ key }) => {
          const n = parseFloat(String(current[key] || '').replace(',', '.'));
          if (!Number.isFinite(n)) return [key, current[key]];
          return [key, String(toUnitValue(fromUnitValue(n, unit), nextUnit))];
        })
      )
    );
    setUnit(nextUnit);
    setGlucoseUnit(nextUnit);
  };

  const handleSave = () => {
    const parsed = {};
    for (const { key, label } of FIELDS) {
      const n = parseFloat(String(values[key] || '').replace(',', '.'));
      if (!Number.isFinite(n)) {
        Alert.alert('Check your targets', `Enter a number for "${label}".`);
        return;
      }
      parsed[key] = fromUnitValue(n, unit);
    }
    request('PUT', parsed);
  };

  const handleReset = () => {
    Alert.alert('Reset targets?', 'Go back to the standard ranges (ADA general targets for adults).', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => request('DELETE') },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={22} color="white" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.title}>My glucose targets</Text>
          <Text style={styles.subtitle}>Used to show which readings are in range</Text>
        </View>
      </View>
      <ScrollView
        style={{ marginTop: -28 }} keyboardShouldPersistTaps="handled" contentContainerStyle={[{ paddingBottom: insets.bottom + 24 }, { paddingTop: 28 }]}>

        {loading || !targets ? (
          <ActivityIndicator style={{ marginTop: 48 }} size="large" color={Colors.primary} />
        ) : (
          <View style={styles.body}>
            <View style={styles.note}>
              <Ionicons name="medkit-outline" size={18} color={Colors.primary} />
              <Text style={styles.noteText}>
                Use the targets agreed with your healthcare team.{' '}
                {targets.is_default ? 'You are using the standard ranges (ADA general targets for adults).' : 'You are using your own targets.'}
              </Text>
            </View>

            <View style={styles.unitBlock}>
              <Text style={styles.unitTitle}>Units</Text>
              <View style={styles.segment}>
                {UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.segmentItem, unit === u && styles.segmentItemActive]}
                    onPress={() => handleUnitChange(u)}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityState={{ selected: unit === u }}
                  >
                    <Text style={[styles.segmentText, unit === u && styles.segmentTextActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.unitHint}>Also used on Home and when you log glucose.</Text>
            </View>

            {FIELDS.map(({ key, label, hint }) => (
              <View key={key} style={styles.field}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.hint}>{hint}</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    value={values[key]}
                    onChangeText={(t) => setValues((v) => ({ ...v, [key]: t }))}
                    keyboardType="decimal-pad"
                    editable={!saving}
                  />
                  <Text style={styles.unit}>{unit}</Text>
                </View>
              </View>
            ))}

            <View style={styles.fixed}>
              <Text style={styles.fixedTitle}>Always flagged</Text>
              <Text style={styles.fixedText}>
                Low: below {formatGlucose(targets.low_mg_dl, unit)} · Very high: {formatGlucose(targets.very_high_mg_dl, unit)} and above
              </Text>
            </View>

            <TouchableOpacity style={[styles.save, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving} activeOpacity={0.88}>
              {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveText}>Save targets</Text>}
            </TouchableOpacity>
            {!targets.is_default ? (
              <TouchableOpacity style={styles.reset} onPress={handleReset} disabled={saving}>
                <Text style={styles.resetText}>Reset to standard ranges</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={styles.disclaimer}>
              GlucoForager supports food decisions and does not give medical advice. Never change medication based on the
              app.
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { zIndex: 10, elevation: 5, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primaryDark, paddingHorizontal: 20, paddingBottom: 18, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '900', color: 'white' },
  subtitle: { marginTop: 3, fontSize: 12, color: 'rgba(255,255,255,0.78)', fontWeight: '700' },
  body: { padding: 18, gap: 12 },
  note: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, backgroundColor: '#E8F4F3' },
  noteText: { flex: 1, fontSize: 13, color: Colors.brandNavy, lineHeight: 19 },
  unitBlock: { backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: '#E9ECE4', padding: 14 },
  unitTitle: { fontSize: 15, fontWeight: '800', color: Colors.brandNavy, marginBottom: 10 },
  segment: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4 },
  segmentItem: { flex: 1, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentItemActive: { backgroundColor: Colors.primary },
  segmentText: { fontSize: 14.5, fontWeight: '800', color: Colors.brandNavy },
  segmentTextActive: { color: 'white' },
  unitHint: { fontSize: 12, color: Colors.textLight, marginTop: 8 },
  field: { backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: '#E9ECE4', padding: 14 },
  label: { fontSize: 15, fontWeight: '800', color: Colors.brandNavy },
  hint: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
  input: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#F8FAFC', paddingHorizontal: 12, fontSize: 17, fontWeight: '800', color: Colors.brandNavy },
  unit: { fontSize: 14, fontWeight: '700', color: Colors.textLight, minWidth: 56 },
  fixed: { padding: 12, borderRadius: 14, backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FED7D7' },
  fixedTitle: { fontSize: 13, fontWeight: '900', color: '#9B2C2C' },
  fixedText: { fontSize: 12.5, color: '#9B2C2C', marginTop: 2 },
  save: { marginTop: 4, height: 52, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: 'white', fontSize: 16, fontWeight: '900' },
  reset: { alignSelf: 'center', paddingVertical: 8 },
  resetText: { color: Colors.primary, fontWeight: '800', fontSize: 14 },
  disclaimer: { fontSize: 11.5, color: Colors.textLight, textAlign: 'center', lineHeight: 17 },
});
