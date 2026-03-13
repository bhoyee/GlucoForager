import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { getTodayTip } from '../../utils/todayTips';
import { addDebugLog } from '../../utils/debugLogger';

const TIP_FEEDBACK_KEY = 'tip_feedback_v1';

const NOT_USEFUL_REASONS = [
  'Too basic',
  'Not relevant to me',
  'I already knew this',
  "Doesn't fit my food style",
];

export default function TodayTipScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom + 12, 12);

  const tip = useMemo(() => {
    const fromRoute = route.params?.tip;
    if (fromRoute?.title && (fromRoute?.tip || fromRoute?.body)) return fromRoute;
    return getTodayTip();
  }, [route.params]);

  const [feedback, setFeedback] = useState(null);
  const [pendingNotUseful, setPendingNotUseful] = useState(false);

  const handleShare = async () => {
    try {
      const tipText = tip.tip || tip.body || '';
      const whyText = tip.why ? `\n\nWhy it helps:\n${tip.why}` : '';
      const tryText = tip.try_today ? `\n\nTry this today:\n${tip.try_today}` : '';
      await Share.share({
        message: `GlucoForager tip: ${tip.title}\n\n${tipText}${whyText}${tryText}`,
      });
    } catch {
      // Ignore share errors.
    }
  };

  const saveFeedback = async (value, reason = null) => {
    setFeedback(value);
    setPendingNotUseful(false);
    try {
      const raw = await AsyncStorage.getItem(TIP_FEEDBACK_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const next = {
        ...parsed,
        [tip.id || tip.title || 'unknown']: {
          feedback: value,
          reason: reason || null,
          at: new Date().toISOString(),
        },
      };
      await AsyncStorage.setItem(TIP_FEEDBACK_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }

    addDebugLog({
      source: 'TodayTip',
      level: 'info',
      message: 'Tip feedback',
      details: JSON.stringify({ tip_id: tip.id || null, title: tip.title, feedback: value, reason: reason || null }),
    });
  };

  const activeState = feedback || (pendingNotUseful ? 'not_useful' : null);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Today&apos;s tip</Text>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Ionicons name="share-social-outline" size={20} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: contentBottomPadding }]}
      >
        <View style={styles.card}>
          <View style={styles.accentBar} />
          <View style={styles.cardHeader}>
            <View style={styles.iconBubble}>
              <Ionicons name="bulb-outline" size={20} color={Colors.primary} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>{tip.title}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Tip</Text>
            <Text style={styles.body}>{tip.tip || tip.body}</Text>
          </View>

          {tip.why ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Why it helps</Text>
              <Text style={styles.body}>{tip.why}</Text>
            </View>
          ) : null}

          {tip.try_today ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Try this today</Text>
              <Text style={styles.body}>{tip.try_today}</Text>
            </View>
          ) : null}

          <View style={styles.feedbackRow}>
            <TouchableOpacity
              style={[styles.feedbackButton, activeState === 'helpful' && styles.feedbackButtonActive]}
              onPress={() => void saveFeedback('helpful')}
              activeOpacity={0.85}
            >
              <Ionicons
                name="thumbs-up-outline"
                size={18}
                color={activeState === 'helpful' ? 'white' : Colors.primary}
              />
              <Text style={[styles.feedbackText, activeState === 'helpful' && styles.feedbackTextActive]}>Helpful</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.feedbackButton, activeState === 'not_useful' && styles.feedbackButtonActiveNegative]}
              onPress={() => {
                if (feedback === 'not_useful') return;
                setPendingNotUseful(true);
              }}
              activeOpacity={0.85}
            >
              <Ionicons
                name="thumbs-down-outline"
                size={18}
                color={activeState === 'not_useful' ? 'white' : Colors.error}
              />
              <Text
                style={[
                  styles.feedbackText,
                  styles.feedbackTextNegative,
                  activeState === 'not_useful' && styles.feedbackTextActive,
                ]}
              >
                Not useful
              </Text>
            </TouchableOpacity>
          </View>
          {pendingNotUseful ? (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonTitle}>What didn’t fit?</Text>
              <View style={styles.reasonGrid}>
                {NOT_USEFUL_REASONS.map((reason) => (
                  <TouchableOpacity
                    key={reason}
                    style={styles.reasonChip}
                    onPress={() => void saveFeedback('not_useful', reason)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.reasonChipText}>{reason}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.reasonSkip}
                onPress={() => void saveFeedback('not_useful', null)}
                activeOpacity={0.85}
              >
                <Text style={styles.reasonSkipText}>Skip</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {feedback ? <Text style={styles.feedbackThanks}>Thanks — we’ll use this to improve tips.</Text> : null}

          <TouchableOpacity
            style={styles.moreLink}
            onPress={() => navigation.navigate('TipsArchive')}
            activeOpacity={0.85}
          >
            <Text style={styles.moreLinkText}>View more tips</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
          </TouchableOpacity>
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
  shareButton: {
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
    paddingTop: 8,
  },
  card: {
    backgroundColor: `${Colors.primary}0A`,
    borderRadius: 16,
    padding: 18,
    position: 'relative',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 14,
    bottom: 14,
    width: 4,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: Colors.primary,
    opacity: 0.9,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: `${Colors.primary}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: '900',
    color: Colors.text,
  },
  section: {
    marginTop: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textLight,
  },
  feedbackRow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  feedbackButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.surface,
  },
  feedbackButtonActive: {
    backgroundColor: Colors.primary,
  },
  feedbackButtonActiveNegative: {
    backgroundColor: Colors.error,
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.primary,
  },
  feedbackTextNegative: {
    color: Colors.error,
  },
  feedbackTextActive: {
    color: 'white',
  },
  feedbackThanks: {
    marginTop: 10,
    fontSize: 12,
    color: Colors.textLight,
    textAlign: 'center',
    fontWeight: '700',
  },
  reasonBox: {
    marginTop: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
  },
  reasonTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 10,
  },
  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  reasonChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `${Colors.error}33`,
    backgroundColor: `${Colors.error}0F`,
  },
  reasonChipText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  reasonSkip: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  reasonSkipText: {
    color: Colors.textLight,
    fontSize: 13,
    fontWeight: '800',
  },
  moreLink: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  moreLinkText: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.secondary,
  },
});
