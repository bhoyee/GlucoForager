import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { apiFetch } from '../../utils/api';
import { API_URL } from '../../config/api';

export default function ChallengeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom + 12, 12);

  const [challenge, setChallenge] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const progress = useMemo(() => {
    const completed = Number(challenge?.progress?.completed || 0);
    const total = Number(challenge?.progress?.total || 0);
    return { completed, total };
  }, [challenge]);

  const loadChallenge = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setChallenge(null);
        setError('Sign in required to use Daily Challenge.');
        return;
      }
      const response = await apiFetch(
        `${API_URL}/api/app/challenge/today`,
        { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
        { timeoutMs: 8000 }
      );
      if (!response.ok) {
        const data = await response.json();
        setError(data?.detail?.message || data?.detail || 'Challenge request failed.');
        setChallenge(null);
        return;
      }
      const data = await response.json();
      setChallenge(data?.challenge || null);
    } catch {
      setError('Network request failed. Please check your connection.');
      setChallenge(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChallenge();
  }, [loadChallenge]);

  const toggleTask = useCallback(async (taskId, nextCompleted, { forceUndo = false } = {}) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      const response = await apiFetch(
        `${API_URL}/api/app/challenge/complete`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: taskId, completed: Boolean(nextCompleted), force_undo: Boolean(forceUndo) }),
        },
        { timeoutMs: 8000 }
      );
      if (!response.ok) {
        const data = await response.json();
        Alert.alert('Daily Challenge', data?.detail?.message || data?.detail || 'Unable to update challenge.');
        return;
      }
      const data = await response.json();
      setChallenge(data?.challenge || null);
    } catch {
      Alert.alert('Daily Challenge', 'Network request failed. Please check your connection.');
    }
  }, []);

  const streakDays = Number(challenge?.streak_days || 0);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentBottomPadding }}
      >
        <View style={[styles.headerPanel, { paddingTop: headerPaddingTop }]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
              <Ionicons name="arrow-back" size={22} color="white" />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Today's Challenge</Text>
              <Text style={styles.headerSubtitle}>
                {progress.completed}/{progress.total} completed
              </Text>
            </View>
            <TouchableOpacity style={styles.resetButton} onPress={() => void loadChallenge()} activeOpacity={0.85}>
              <Ionicons name="refresh" size={18} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroIcon}>
              <Ionicons name="trophy-outline" size={22} color={Colors.primaryDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>Today</Text>
              <Text style={styles.heroTitle}>Build your blood sugar streak</Text>
            </View>
          </View>
          <Text style={styles.heroTask}>Complete these simple actions to support healthier blood sugar habits today.</Text>

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <View style={styles.progressPill}>
              <Ionicons name="trending-up-outline" size={16} color={Colors.primary} />
              <Text style={styles.progressText}>
                Progress {progress.completed} / {progress.total}
              </Text>
              <View style={styles.progressDot} />
              <Text style={styles.progressText}>Streak {streakDays} days</Text>
            </View>
          )}
        </View>

        <View style={styles.listCard}>
          <Text style={styles.listTitle}>Tasks</Text>
          {Array.isArray(challenge?.tasks) && challenge.tasks.length > 0 ? (
            challenge.tasks.map((item) => {
              const done = Boolean(item.completed);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.row}
                  onPress={() => {
                    if (challenge?.completed_today && done) {
                      Alert.alert(
                        'Undo completion?',
                        "This will undo today's completion and may affect your streak.",
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Undo',
                            style: 'destructive',
                            onPress: () => void toggleTask(item.id, false, { forceUndo: true }),
                          },
                        ]
                      );
                      return;
                    }
                    void toggleTask(item.id, !done);
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={done ? 'checkmark-circle' : 'ellipse-outline'}
                    size={18}
                    color={done ? Colors.success : Colors.textLight}
                  />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{item.text}</Text>
                    <Text style={styles.rowSub}>{done ? 'Completed' : 'Tap to mark as done'}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : loading ? null : (
            <Text style={styles.rowSub}>No tasks yet. Please try again.</Text>
          )}
        </View>

        {Boolean(challenge?.completed_today) ? (
          <View style={styles.completeCard}>
            <Text style={styles.completeTitle}>Challenge Complete</Text>
            <Text style={styles.completeSub}>Great work supporting healthier blood sugar habits today.</Text>
          </View>
        ) : null}
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
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetButton: {
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
  content: {
    paddingTop: 18,
  },
  hero: {
    marginHorizontal: 20,
    backgroundColor: '#F6FBF7',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#DCEFE4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F5EA',
  },
  heroLabel: { fontSize: 12, fontWeight: '900', color: Colors.primary, textTransform: 'uppercase' },
  heroTitle: { marginTop: 4, fontSize: 20, fontWeight: '900', color: Colors.text },
  heroTask: { marginTop: 14, fontSize: 15, lineHeight: 22, color: Colors.textLight, fontWeight: '600' },
  loadingRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13, color: Colors.textLight, fontWeight: '700' },
  errorText: { marginTop: 14, fontSize: 13, lineHeight: 18, color: Colors.danger, fontWeight: '700' },
  progressPill: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${Colors.primary}12`,
    borderColor: `${Colors.primary}28`,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  progressText: { fontSize: 12, color: Colors.primary, fontWeight: '900' },
  progressDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: `${Colors.primary}66` },
  listCard: {
    marginTop: 14,
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  listTitle: { fontSize: 16, fontWeight: '900', color: Colors.text },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '900', color: Colors.text },
  rowSub: { marginTop: 4, fontSize: 12, color: Colors.textLight, fontWeight: '700' },
  completeCard: {
    marginTop: 12,
    marginHorizontal: 20,
    backgroundColor: `${Colors.success}12`,
    borderColor: `${Colors.success}28`,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  completeTitle: { fontSize: 14, fontWeight: '900', color: Colors.success },
  completeSub: { marginTop: 4, fontSize: 12, lineHeight: 18, color: Colors.textLight, fontWeight: '700' },
});
