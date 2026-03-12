import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';

const STORAGE_KEY = 'challenge_7day_v1';

const DAYS = [
  { day: 1, title: 'Swap refined carbs', task: 'Replace refined carbs with a better option (whole grain or veggie swap).' },
  { day: 2, title: 'Protein before carbs', task: 'Start meals with protein first (eggs, chicken, fish, Greek yogurt).' },
  { day: 3, title: 'Add fiber', task: 'Add a fiber booster (salad, beans, chia seeds, veg) to one meal.' },
  { day: 4, title: '10‑minute walk', task: 'Take a 10‑minute walk after your biggest meal.' },
  { day: 5, title: 'Hydration check', task: 'Drink water through the day. Aim for a glass with each meal.' },
  { day: 6, title: 'Balanced plate', task: 'Build 1 meal with the plate method: ½ veg, ¼ protein, ¼ carbs.' },
  { day: 7, title: 'Reflect & repeat', task: 'Pick the habit that helped most and plan to repeat it next week.' },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

const diffDays = (startISO, nowISO) => {
  const start = new Date(`${startISO}T00:00:00Z`);
  const now = new Date(`${nowISO}T00:00:00Z`);
  const diff = now.getTime() - start.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
};

export default function ChallengeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom + 12, 12);

  const [state, setState] = useState({
    started_at: null,
    completed: {},
  });

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const data = raw ? JSON.parse(raw) : null;
        if (data && typeof data === 'object') {
          setState({
            started_at: data.started_at || null,
            completed: data.completed && typeof data.completed === 'object' ? data.completed : {},
          });
        }
      } catch {
        // Ignore.
      }
    };
    load();
  }, []);

  const persist = async (next) => {
    setState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore.
    }
  };

  const started = Boolean(state.started_at);
  const nowISO = todayISO();
  const dayIndex = started ? diffDays(state.started_at, nowISO) : 0;
  const currentDay = Math.min(7, dayIndex + 1);

  const progress = useMemo(() => {
    const completedDays = Object.values(state.completed || {}).filter(Boolean).length;
    return { completedDays, total: 7 };
  }, [state.completed]);

  const toggleToday = async () => {
    if (!started) {
      await persist({ started_at: nowISO, completed: {} });
      return;
    }
    const key = String(currentDay);
    const next = {
      ...state,
      completed: {
        ...(state.completed || {}),
        [key]: !state.completed?.[key],
      },
    };
    await persist(next);
  };

  const reset = async () => {
    Alert.alert('Reset challenge?', 'This will clear your progress.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => void persist({ started_at: null, completed: {} }),
      },
    ]);
  };

  const day = DAYS.find((d) => d.day === currentDay) || DAYS[0];
  const todayDone = Boolean(state.completed?.[String(currentDay)]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>7‑Day Challenge</Text>
          <Text style={styles.headerSubtitle}>
            {progress.completedDays}/{progress.total} completed
          </Text>
        </View>
        <TouchableOpacity style={styles.resetButton} onPress={reset}>
          <Ionicons name="refresh" size={18} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentBottomPadding }}
      >
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Today</Text>
          <Text style={styles.heroTitle}>
            Day {currentDay}: {day.title}
          </Text>
          <Text style={styles.heroTask}>{day.task}</Text>

          <TouchableOpacity
            style={[styles.cta, todayDone ? styles.ctaDone : null]}
            onPress={() => void toggleToday()}
            activeOpacity={0.9}
          >
            <Ionicons
              name={todayDone ? 'checkmark-circle' : 'radio-button-off'}
              size={20}
              color={todayDone ? 'white' : Colors.primary}
            />
            <Text style={[styles.ctaText, todayDone ? styles.ctaTextDone : null]}>
              {started ? (todayDone ? 'Completed' : 'Mark as done') : 'Start challenge'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.listCard}>
          <Text style={styles.listTitle}>All days</Text>
          {DAYS.map((item) => {
            const done = Boolean(state.completed?.[String(item.day)]);
            return (
              <View key={item.day} style={styles.row}>
                <Ionicons
                  name={done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={18}
                  color={done ? Colors.success : Colors.textLight}
                />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>Day {item.day}: {item.title}</Text>
                  <Text style={styles.rowSub}>{item.task}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: { flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: Colors.text },
  headerSubtitle: { marginTop: 2, fontSize: 12, color: Colors.textLight, fontWeight: '700' },
  hero: {
    marginTop: 8,
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  heroLabel: { fontSize: 12, fontWeight: '900', color: Colors.primary, textTransform: 'uppercase' },
  heroTitle: { marginTop: 8, fontSize: 18, fontWeight: '900', color: Colors.text },
  heroTask: { marginTop: 8, fontSize: 14, lineHeight: 20, color: Colors.textLight, fontWeight: '600' },
  cta: {
    marginTop: 14,
    backgroundColor: `${Colors.primary}12`,
    borderWidth: 1,
    borderColor: `${Colors.primary}28`,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
  },
  ctaDone: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  ctaText: { fontSize: 14, fontWeight: '900', color: Colors.primary },
  ctaTextDone: { color: 'white' },
  listCard: {
    marginTop: 14,
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  listTitle: { fontSize: 16, fontWeight: '900', color: Colors.text, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 10, alignItems: 'flex-start' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  rowSub: { marginTop: 2, fontSize: 12, lineHeight: 17, color: Colors.textLight, fontWeight: '600' },
});

