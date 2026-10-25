import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { apiFetch } from '../../utils/api';
import { API_URL } from '../../config/api';
import { cancelTodaysDailyGuidanceNotification } from '../../utils/mealReminders';
import { recordPositiveMoment } from '../../utils/ratingPrompt';

const CATEGORY = {
  meal_structure: { label: 'Meals', icon: 'restaurant', color: '#2C8632', bg: '#E9F6EA' },
  portion_control: { label: 'Portions', icon: 'pie-chart', color: '#B7791F', bg: '#FFF4DE' },
  food_choice: { label: 'Food choices', icon: 'nutrition', color: '#C05621', bg: '#FFF1E6' },
  activity: { label: 'Movement', icon: 'walk', color: '#2B6CB0', bg: '#EBF4FF' },
  hydration: { label: 'Water', icon: 'water', color: '#0E8FA8', bg: '#E4F7FA' },
  awareness: { label: 'Mindset', icon: 'sparkles', color: '#6B46C1', bg: '#F0EBFB' },
};
const OTHER = { label: 'Habit', icon: 'checkmark-done', color: Colors.primary, bg: '#E8F4F3' };

const STREAK_MILESTONES = [3, 7, 14, 30, 100];
const MILESTONE_STORAGE_KEY = 'highest_streak_milestone_v1';

function ProgressRing({ done, total, size = 96, stroke = 10 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.18)" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#B9F6CA"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={styles.ringNumber}>
        {done}
        <Text style={styles.ringTotal}>/{total}</Text>
      </Text>
      <Text style={styles.ringLabel}>done</Text>
    </View>
  );
}

export default function ChallengeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom + 12, 12);

  const [challenge, setChallenge] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [swappingId, setSwappingId] = useState(null);
  const [milestoneStreak, setMilestoneStreak] = useState(null);

  const maybeCelebrateStreak = useCallback(async (challengeData) => {
    const streak = Number(challengeData?.streak_days || 0);
    if (!challengeData?.completed_today || !STREAK_MILESTONES.includes(streak)) return;
    try {
      const stored = await AsyncStorage.getItem(MILESTONE_STORAGE_KEY);
      const highest = stored ? Number(stored) || 0 : 0;
      if (streak > highest) {
        await AsyncStorage.setItem(MILESTONE_STORAGE_KEY, String(streak));
        setMilestoneStreak(streak);
      }
    } catch {
      // Ignore storage errors - celebration just won't show this time.
    }
  }, []);

  const progress = useMemo(() => {
    const completed = Number(challenge?.progress?.completed || 0);
    const total = Number(challenge?.progress?.total || 0);
    return { completed, total };
  }, [challenge]);

  const loadChallenge = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
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
      void maybeCelebrateStreak(data?.challenge);
    } catch {
      setError('Network request failed. Please check your connection.');
      setChallenge(null);
    } finally {
      setLoading(false);
    }
  }, [maybeCelebrateStreak]);

  // Reload on every visit: tasks done elsewhere (a logged reading, a cooked recipe) tick themselves.
  useFocusEffect(
    useCallback(() => {
      void loadChallenge({ quiet: Boolean(challenge) });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadChallenge])
  );

  const toggleTask = useCallback(async (taskId, nextCompleted, { forceUndo = false } = {}) => {
    setBusyId(taskId);
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
      void maybeCelebrateStreak(data?.challenge);
      if (data?.challenge?.completed_today) {
        if (nextCompleted) void recordPositiveMoment();
        void cancelTodaysDailyGuidanceNotification();
      }
    } catch {
      Alert.alert('Daily Challenge', 'Network request failed. Please check your connection.');
    } finally {
      setBusyId(null);
    }
  }, [maybeCelebrateStreak]);

  const swapTask = useCallback(async (taskId) => {
    setSwappingId(taskId);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      const response = await apiFetch(
        `${API_URL}/api/app/challenge/swap`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: taskId }),
        },
        { timeoutMs: 8000 }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        Alert.alert('Swap task', typeof data?.detail === 'string' ? data.detail : 'Unable to swap this task right now.');
        return;
      }
      setChallenge(data?.challenge || null);
    } catch {
      Alert.alert('Swap task', 'Network request failed. Please check your connection.');
    } finally {
      setSwappingId(null);
    }
  }, []);

  const onTaskPress = (item) => {
    const done = Boolean(item.completed);
    if (challenge?.completed_today && done) {
      Alert.alert('Undo completion?', "This will undo today's completion and may affect your streak.", [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Undo', style: 'destructive', onPress: () => void toggleTask(item.id, false, { forceUndo: true }) },
      ]);
      return;
    }
    void toggleTask(item.id, !done);
  };

  const openAction = (action) => {
    const screen = action?.screen;
    if (!screen) return;
    try {
      if (screen === 'BarcodeScan') navigation.navigate('Scan', { screen: 'BarcodeScan' });
      else navigation.navigate(screen);
    } catch {
      Alert.alert('Premium feature', 'The meal planner is part of Premium.');
    }
  };

  const streakDays = Number(challenge?.streak_days || 0);
  const week = Array.isArray(challenge?.week) ? challenge.week : [];
  const tasks = Array.isArray(challenge?.tasks) ? challenge.tasks : [];
  const left = Math.max(0, progress.total - progress.completed);
  const swapsLeft = Number(challenge?.swaps_left ?? 0);

  return (
    <View style={styles.container}>
      <View style={[styles.headerPanel, { paddingTop: headerPaddingTop }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Today&apos;s Challenge</Text>
            <Text style={styles.headerSubtitle}>Small wins for steadier blood sugar</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* Ring + streak */}
        <View style={styles.heroRow}>
          <ProgressRing done={progress.completed} total={progress.total || 0} />
          <View style={{ flex: 1 }}>
            <View style={styles.streakRow}>
              <Ionicons name="flame" size={22} color={streakDays ? '#FFB347' : 'rgba(255,255,255,0.5)'} />
              <Text style={styles.streakNumber}>{streakDays}</Text>
              <Text style={styles.streakLabel}>day streak</Text>
            </View>
            <Text style={styles.heroLine}>
              {challenge?.completed_today
                ? 'All done today. Brilliant!'
                : progress.total
                  ? `${left} to go to keep your streak`
                  : 'Loading your tasks…'}
            </Text>
            {week.length ? (
              <View style={styles.weekRow}>
                {week.map((d, i) => {
                  const label = new Date(`${d.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' });
                  const today = i === week.length - 1;
                  return (
                    <View key={d.date} style={styles.weekDay}>
                      <View
                        style={[
                          styles.weekDot,
                          d.state === 'done' && styles.weekDotDone,
                          d.state === 'partial' && styles.weekDotPartial,
                          today && styles.weekDotToday,
                        ]}
                      >
                        {d.state === 'done' ? <Ionicons name="flame" size={12} color="#7A4B00" /> : null}
                      </View>
                      <Text style={[styles.weekLabel, today && { color: 'white' }]}>{label}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <ScrollView
        style={{ marginTop: -28 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 28, paddingBottom: contentBottomPadding + 16 }}
      >
        <View style={styles.content}>
          {loading && !challenge ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading your challenge…</Text>
            </View>
          ) : error ? (
            <View style={styles.errorCard}>
              <Ionicons name="cloud-offline-outline" size={20} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {challenge?.completed_today ? (
            <LinearGradient colors={['#56C75D', '#2C8632']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.doneBanner}>
              <Ionicons name="trophy" size={26} color="white" />
              <View style={{ flex: 1 }}>
                <Text style={styles.doneTitle}>Challenge complete</Text>
                <Text style={styles.doneSub}>Great work. Come back tomorrow to grow your streak.</Text>
              </View>
            </LinearGradient>
          ) : null}

          {tasks.map((item) => {
            const done = Boolean(item.completed);
            const cat = CATEGORY[item.category] || OTHER;
            return (
              <View key={item.id} style={[styles.taskCard, done && styles.taskCardDone]}>
                <TouchableOpacity style={styles.taskMain} onPress={() => onTaskPress(item)} activeOpacity={0.85} disabled={busyId === item.id}>
                  <View style={[styles.taskIcon, { backgroundColor: cat.bg }]}>
                    <Ionicons name={cat.icon} size={18} color={cat.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.taskCategory, { color: cat.color }]}>{cat.label}</Text>
                    <Text style={[styles.taskText, done && styles.taskTextDone]}>{item.text}</Text>
                  </View>
                  {!done && swapsLeft > 0 ? (
                    <TouchableOpacity
                      style={styles.swapButton}
                      onPress={() => void swapTask(item.id)}
                      disabled={Boolean(swappingId)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Swap this task"
                    >
                      {swappingId === item.id ? (
                        <ActivityIndicator size="small" color={Colors.textLight} />
                      ) : (
                        <Ionicons name="shuffle" size={16} color={Colors.textLight} />
                      )}
                    </TouchableOpacity>
                  ) : null}
                  {busyId === item.id ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <View style={[styles.check, done && styles.checkOn]}>
                      {done ? <Ionicons name="checkmark" size={16} color="white" /> : null}
                    </View>
                  )}
                </TouchableOpacity>
                {!done && (item.auto_hint || item.action) ? (
                  <View style={styles.taskFooter}>
                    {item.auto_hint ? (
                      <View style={styles.autoRow}>
                        <Ionicons name="sparkles" size={12} color="#6B46C1" />
                        <Text style={styles.autoText} numberOfLines={2}>
                          {item.auto_hint}
                        </Text>
                      </View>
                    ) : (
                      <View style={{ flex: 1 }} />
                    )}
                    {item.action ? (
                      <TouchableOpacity style={styles.actionButton} onPress={() => openAction(item.action)} activeOpacity={0.85}>
                        <Text style={styles.actionText}>{item.action.label}</Text>
                        <Ionicons name="arrow-forward" size={13} color={Colors.primary} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}

          {tasks.length && !challenge?.completed_today ? (
            <View style={styles.swapHint}>
              <Ionicons name="shuffle" size={14} color={Colors.textLight} />
              <Text style={styles.swapHintText}>
                {swapsLeft > 0
                  ? `A task doesn't suit today? Tap the shuffle icon to swap it (${swapsLeft} swap${swapsLeft === 1 ? '' : 's'} left).`
                  : "You've used today's swaps. New tasks tomorrow!"}
              </Text>
            </View>
          ) : null}

          {!loading && !error && !tasks.length ? <Text style={styles.emptyText}>No tasks yet. Pull to refresh or try again.</Text> : null}
        </View>
      </ScrollView>

      <Modal visible={Boolean(milestoneStreak)} transparent animationType="fade" onRequestClose={() => setMilestoneStreak(null)}>
        <View style={styles.milestoneOverlay}>
          <View style={styles.milestoneCard}>
            <LinearGradient colors={['#FFB347', '#F6852B']} style={styles.milestoneIcon}>
              <Ionicons name="flame" size={34} color="white" />
            </LinearGradient>
            <Text style={styles.milestoneTitle}>{milestoneStreak}-day streak!</Text>
            <Text style={styles.milestoneSub}>
              You&apos;ve completed your daily challenge {milestoneStreak} days in a row. Keep it going.
            </Text>
            <TouchableOpacity style={styles.milestoneButton} onPress={() => setMilestoneStreak(null)} activeOpacity={0.9}>
              <Text style={styles.milestoneButtonText}>Nice!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const CARD_SHADOW = {
  shadowColor: '#0F2A3A',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerPanel: {
    zIndex: 10,
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
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
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 18 },
  ringNumber: { fontSize: 26, fontWeight: '900', color: 'white' },
  ringTotal: { fontSize: 15, fontWeight: '800', color: 'rgba(255,255,255,0.7)' },
  ringLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.7)', marginTop: -2 },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  streakNumber: { fontSize: 24, fontWeight: '900', color: 'white' },
  streakLabel: { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.8)' },
  heroLine: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  weekDay: { alignItems: 'center', gap: 4 },
  weekDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  weekDotDone: { backgroundColor: '#FFE7A8' },
  weekDotPartial: { backgroundColor: 'rgba(185,246,202,0.45)' },
  weekDotToday: { borderWidth: 2, borderColor: 'white' },
  weekLabel: { fontSize: 10.5, fontWeight: '800', color: 'rgba(255,255,255,0.65)' },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8 },
  loadingText: { fontSize: 13, color: Colors.textLight, fontWeight: '700' },
  errorCard: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#FDECEC', borderRadius: 16, padding: 14 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18, color: Colors.danger, fontWeight: '700' },
  doneBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 16 },
  doneTitle: { fontSize: 16, fontWeight: '900', color: 'white' },
  doneSub: { fontSize: 12.5, fontWeight: '700', color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  taskCard: { backgroundColor: 'white', borderRadius: 20, borderWidth: 1, borderColor: '#EDF0EA', ...CARD_SHADOW },
  taskCardDone: { backgroundColor: '#F7FBF7' },
  taskMain: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  taskIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  taskCategory: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  taskText: { fontSize: 15, fontWeight: '800', color: Colors.brandNavy, marginTop: 2, lineHeight: 20 },
  taskTextDone: { color: Colors.textLight, textDecorationLine: 'line-through' },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#B8C7C3', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: '#2C8632', borderColor: '#2C8632' },
  taskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F3F1',
  },
  autoRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  autoText: { flex: 1, fontSize: 11.5, fontWeight: '700', color: '#6B46C1' },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8F4F3', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  actionText: { fontSize: 12.5, fontWeight: '900', color: Colors.primary },
  swapButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F3', alignItems: 'center', justifyContent: 'center' },
  swapHint: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, marginTop: 2 },
  swapHintText: { flex: 1, fontSize: 12.5, color: Colors.textLight, fontWeight: '600', lineHeight: 17 },
  emptyText: { fontSize: 13, color: Colors.textLight, textAlign: 'center', padding: 12 },
  milestoneOverlay: { flex: 1, backgroundColor: 'rgba(7, 29, 24, 0.72)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  milestoneCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 18 },
    shadowRadius: 28,
    elevation: 10,
  },
  milestoneIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  milestoneTitle: { fontSize: 22, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  milestoneSub: { marginTop: 10, fontSize: 14, lineHeight: 20, color: Colors.textLight, fontWeight: '600', textAlign: 'center' },
  milestoneButton: { marginTop: 20, minWidth: 160, height: 48, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  milestoneButtonText: { color: 'white', fontSize: 15, fontWeight: '800' },
});
