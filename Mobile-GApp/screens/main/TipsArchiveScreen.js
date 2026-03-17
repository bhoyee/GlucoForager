import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { TIPS, getTodayTip } from '../../utils/todayTips';

const TIP_FEEDBACK_KEY = 'tip_feedback_v1';

const TABS = [
  { id: 'previous', label: 'Previous' },
  { id: 'saved', label: 'Saved' },
  { id: 'all', label: 'All' },
];

const dayOfYearLocal = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff =
    date -
    start +
    (start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const normalizeCategory = (value) => String(value || 'general').trim() || 'general';

export default function TipsArchiveScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom + 12, 12);

  const [tab, setTab] = useState('previous');
  const [category, setCategory] = useState('all');
  const [feedbackById, setFeedbackById] = useState({});

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(TIP_FEEDBACK_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        if (mounted && parsed && typeof parsed === 'object') setFeedbackById(parsed);
      } catch {
        // ignore
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const today = useMemo(() => getTodayTip(), []);
  const todayIndex = useMemo(() => {
    const now = new Date();
    const index = Math.abs(dayOfYearLocal(now)) % TIPS.length;
    return index;
  }, []);

  const categories = useMemo(() => {
    const set = new Set(TIPS.map((t) => normalizeCategory(t.category)));
    return ['all', ...Array.from(set).sort()];
  }, []);

  const savedIds = useMemo(() => {
    const out = new Set();
    Object.entries(feedbackById || {}).forEach(([id, v]) => {
      if (v && v.feedback === 'helpful') out.add(String(id));
    });
    return out;
  }, [feedbackById]);

  const listItems = useMemo(() => {
    let base = TIPS;

    if (tab === 'saved') {
      base = TIPS.filter((t) => savedIds.has(t.id));
    } else if (tab === 'previous') {
      const days = 30;
      const ordered = [];
      for (let offset = 0; offset < Math.min(days, TIPS.length); offset += 1) {
        const idx = (todayIndex - offset + TIPS.length) % TIPS.length;
        ordered.push(TIPS[idx]);
      }
      base = ordered;
    }

    if (category !== 'all') {
      base = base.filter((t) => normalizeCategory(t.category) === category);
    }

    return base;
  }, [tab, category, savedIds, todayIndex]);

  const openTip = (tip) => {
    navigation.navigate('TodayTip', { tip });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>More guidance</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: contentBottomPadding }]}
      >
        <View style={styles.tabsRow}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.tabButton, tab === t.id && styles.tabButtonActive]}
              onPress={() => setTab(t.id)}
              activeOpacity={0.85}
            >
              <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {categories.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.categoryChip, category === c && styles.categoryChipActive]}
              onPress={() => setCategory(c)}
              activeOpacity={0.85}
            >
              <Text style={[styles.categoryText, category === c && styles.categoryTextActive]}>
                {c === 'all' ? 'All categories' : c}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.list}>
          {listItems.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No tips yet</Text>
              <Text style={styles.emptyText}>
                Mark a tip as Helpful to see it under Saved.
              </Text>
            </View>
          ) : (
            listItems.map((t) => {
              const isToday = t.id === today?.id;
              const isSaved = savedIds.has(t.id);
              return (
                <TouchableOpacity key={t.id} style={styles.tipRow} onPress={() => openTip(t)} activeOpacity={0.85}>
                  <View style={styles.tipIcon}>
                    <Ionicons name="bulb-outline" size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.tipBody}>
                    <View style={styles.tipTopLine}>
                      <Text style={styles.tipTitle} numberOfLines={1}>
                        {t.title}
                      </Text>
                      {isToday ? <Text style={styles.badge}>Today</Text> : null}
                      {isSaved ? <Ionicons name="bookmark" size={14} color={Colors.primary} /> : null}
                    </View>
                    <Text style={styles.tipPreview} numberOfLines={2}>
                      {t.tip}
                    </Text>
                    <Text style={styles.tipMeta}>{normalizeCategory(t.category)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              );
            })
          )}
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
    justifyContent: 'space-between',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: `${Colors.primary}14`,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.textLight,
  },
  tabTextActive: {
    color: Colors.primaryDark,
  },
  categoryRow: {
    paddingVertical: 4,
    gap: 10,
    marginBottom: 14,
  },
  categoryChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryChipActive: {
    borderColor: `${Colors.primary}66`,
    backgroundColor: `${Colors.primary}10`,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.textLight,
  },
  categoryTextActive: {
    color: Colors.primaryDark,
  },
  list: {
    gap: 10,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.surface,
  },
  tipIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: `${Colors.primary}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipBody: { flex: 1 },
  tipTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tipTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
    color: Colors.text,
  },
  badge: {
    fontSize: 11,
    fontWeight: '900',
    color: Colors.primaryDark,
    backgroundColor: `${Colors.primary}14`,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  tipPreview: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textLight,
  },
  tipMeta: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  empty: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: Colors.surface,
  },
  emptyTitle: { fontSize: 14, fontWeight: '900', color: Colors.text },
  emptyText: { marginTop: 8, fontSize: 13, color: Colors.textLight, lineHeight: 18 },
});
