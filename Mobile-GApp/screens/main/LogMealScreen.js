import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { apiFetch } from '../../utils/api';
import { API_URL } from '../../config/api';

export default function LogMealScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);

  const [description, setDescription] = useState('');
  const [carbs, setCarbs] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = description.trim();
    if (!trimmed) {
      Alert.alert('Add a description', 'Say what you ate, e.g. "Grilled chicken with rice and vegetables".');
      return;
    }
    const trimmedCarbs = carbs.trim();
    let carbsValue;
    if (trimmedCarbs) {
      const parsed = parseFloat(trimmedCarbs);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) {
        Alert.alert('Check the carbs value', 'Enter a number of grams between 0 and 1000, or leave it blank.');
        return;
      }
      carbsValue = parsed;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to log a meal.');
        return;
      }
      const response = await apiFetch(
        `${API_URL}/api/app/meals`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: trimmed, carbs_g: carbsValue }),
        },
        { timeoutMs: 8000 }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        Alert.alert('Unable to log meal', data?.detail?.message || data?.detail || 'Please try again.');
        return;
      }
      navigation.goBack();
    } catch {
      Alert.alert('Unable to log meal', 'Network request failed. Please check your connection.');
    } finally {
      setIsSaving(false);
    }
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
              <Text style={styles.headerTitle}>Log a meal</Text>
              <Text style={styles.headerSubtitle}>Logged as right now</Text>
            </View>
            <View style={{ width: 44 }} />
          </View>
        </View>

        <View style={styles.content}>
          <Text style={styles.label}>What did you eat?</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Grilled chicken with rice and vegetables"
            placeholderTextColor={Colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            autoFocus
          />
          <Text style={styles.hint}>
            A quick note is enough - this helps connect meals to how your glucose responds later.
          </Text>

          <Text style={[styles.label, { marginTop: 20 }]}>Carbs, if you know it (optional)</Text>
          <TextInput
            style={styles.carbsInput}
            placeholder="e.g. 45"
            placeholderTextColor={Colors.textMuted}
            value={carbs}
            onChangeText={(text) => setCarbs(text.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            maxLength={5}
          />
          <Text style={styles.hint}>
            Leave this blank if you're not sure - it just won't count toward today's carb total.
          </Text>

          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.9}
          >
            <Text style={styles.saveButtonText}>{isSaving ? 'Logging...' : 'Log meal'}</Text>
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
  label: { fontSize: 15, fontWeight: '800', color: Colors.text, marginBottom: 10 },
  input: {
    minHeight: 96,
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
  hint: { marginTop: 10, fontSize: 12, lineHeight: 18, color: Colors.textLight, fontWeight: '600' },
  carbsInput: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
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
