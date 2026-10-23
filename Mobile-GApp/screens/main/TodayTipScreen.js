import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, ScrollView, Image, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GlucoseImpactCard from '../../components/GlucoseImpactCard';
import { apiFetch } from '../../utils/api';
import { API_URL } from '../../config/api';
import { formatGlucose, getGlucoseUnit } from '../../utils/glucose';
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

const getLocalDayKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTipStorageId = (tip) => String(tip?.id || tip?.title || 'unknown');

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
  const [photoUrl, setPhotoUrl] = useState(tip?.photo?.url || null);
  const [unit, setUnit] = useState('mg/dL');
  const personal = tip?.personal || null;

  useEffect(() => {
    getGlucoseUnit().then(setUnit).catch(() => {});
  }, []);

  // A food photo made for the first time takes a few seconds: check back until it's ready.
  useEffect(() => {
    setPhotoUrl(tip?.photo?.url || null);
    const name = tip?.photo?.name;
    if (!name || tip?.photo?.url || !tip?.photo?.pending) return undefined;
    let cancelled = false;
    let tries = 0;
    let timer;
    const poll = async () => {
      if (cancelled) return;
      tries += 1;
      try {
        const token = await AsyncStorage.getItem('userToken');
        const res = await apiFetch(
          `${API_URL}/api/app/food-images?name=${encodeURIComponent(name)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
          { timeoutMs: 8000 }
        );
        if (res.ok) {
          const data = await res.json();
          const url = data?.images?.[name];
          if (url && !cancelled) {
            setPhotoUrl(url);
            return;
          }
        }
      } catch {
        // Photo is optional.
      }
      if (!cancelled && tries < 14) timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tip]);
  const [pendingNotUseful, setPendingNotUseful] = useState(false);
  const feedbackDayKey = useMemo(() => getLocalDayKey(), []);
  const feedbackStorageId = useMemo(() => `${feedbackDayKey}:${getTipStorageId(tip)}`, [feedbackDayKey, tip]);

  useEffect(() => {
    let active = true;
    const loadFeedback = async () => {
      try {
        const raw = await AsyncStorage.getItem(TIP_FEEDBACK_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        const saved = parsed?.[feedbackStorageId];
        if (active && saved?.day === feedbackDayKey && saved?.feedback) {
          setFeedback(saved.feedback);
          setPendingNotUseful(false);
        }
      } catch {
        // ignore storage errors
      }
    };
    setFeedback(null);
    setPendingNotUseful(false);
    void loadFeedback();
    return () => {
      active = false;
    };
  }, [feedbackDayKey, feedbackStorageId]);

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
    if (feedback) return;
    setFeedback(value);
    setPendingNotUseful(false);
    try {
      const raw = await AsyncStorage.getItem(TIP_FEEDBACK_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const next = {
        ...parsed,
        [feedbackStorageId]: {
          feedback: value,
          reason: reason || null,
          day: feedbackDayKey,
          tip_id: tip.id || null,
          title: tip.title,
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
      details: JSON.stringify({
        tip_id: tip.id || null,
        title: tip.title,
        feedback: value,
        reason: reason || null,
        day: feedbackDayKey,
      }),
    });
  };

  const activeState = feedback || (pendingNotUseful ? 'not_useful' : null);

  return (
    <View style={styles.container}>
      <View style={[styles.headerPanel, { paddingTop: headerPaddingTop }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Daily Guidance</Text>
            <Text style={styles.headerSubtitle}>Small habits for steadier days</Text>
          </View>
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Ionicons name="share-social-outline" size={20} color="white" />
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView
        style={{ marginTop: -28 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingBottom: contentBottomPadding }, { paddingTop: 28 }]}
      >
        <View style={styles.content}>
        <View style={styles.heroCard}>
          {photoUrl || tip?.photo?.pending ? (
            <View style={styles.photoWrap}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.photo} resizeMode="cover" />
              ) : (
                <LinearGradient colors={['#E6F2EF', '#CFE6E1']} style={[styles.photo, styles.photoEmpty]}>
                  <ActivityIndicator color={Colors.primary} />
                </LinearGradient>
              )}
              <LinearGradient colors={['transparent', 'rgba(6,30,26,0.55)']} style={styles.photoShade} />
              {personal ? (
                <View style={styles.personalBadge}>
                  <Ionicons name="person" size={11} color="#7A4B00" />
                  <Text style={styles.personalBadgeText}>Based on your readings</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={styles.heroTopRow}>
            <View style={styles.iconBubble}>
              <Ionicons name="sparkles-outline" size={22} color={Colors.primaryDark} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>Today's guidance</Text>
              <Text style={styles.title}>{tip.title}</Text>
            </View>
          </View>

          <Text style={styles.heroBody}>{tip.tip || tip.body}</Text>

          {personal ? (
            <View style={styles.personalStat}>
              <Ionicons name="analytics" size={16} color="#C05621" />
              <Text style={styles.personalStatText}>
                Above target {personal.above} of {personal.times} times after {String(personal.food || '').toLowerCase()}
                {personal.avg_after_mg_dl ? ` · average ${formatGlucose(personal.avg_after_mg_dl, unit)}` : ''}
              </Text>
            </View>
          ) : null}

          <View style={styles.guidanceMetaRow}>
            <View style={styles.metaChip}>
              <Ionicons name="shield-checkmark-outline" size={15} color={Colors.primaryDark} />
              <Text style={styles.metaChipText}>{personal ? 'Personal tip' : 'Blood sugar friendly'}</Text>
            </View>
            <View style={styles.metaChip}>
              <Ionicons name="time-outline" size={15} color={Colors.primaryDark} />
              <Text style={styles.metaChipText}>Today</Text>
            </View>
          </View>
        </View>

        {tip.why ? (
          <View style={styles.detailCard}>
            <View style={styles.detailIcon}>
              <Ionicons name="leaf-outline" size={18} color={Colors.primaryDark} />
            </View>
            <View style={styles.detailCopy}>
              <Text style={styles.sectionLabel}>Why it helps</Text>
              <Text style={styles.body}>{tip.why}</Text>
            </View>
          </View>
        ) : null}

        {tip?.compare?.main?.impact && tip?.compare?.other?.impact ? (
          <GlucoseImpactCard
            simple
            title={`${tip.compare.title || 'See the difference'}: how your blood sugar responds`}
            explain={tip.compare.note || null}
            impact={tip.compare.main.impact}
            compare={{ impact: tip.compare.other.impact, label: tip.compare.other.label, mainLabel: tip.compare.main.label }}
          />
        ) : null}

        {tip.try_today ? (
          <View style={styles.detailCard}>
            <View style={styles.detailIcon}>
              <Ionicons name="checkmark-done-outline" size={18} color={Colors.primaryDark} />
            </View>
            <View style={styles.detailCopy}>
              <Text style={styles.sectionLabel}>Try this today</Text>
              <Text style={styles.body}>{tip.try_today}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.feedbackCard}>
          <Text style={styles.feedbackTitle}>Was this useful?</Text>
          <Text style={styles.feedbackSubtitle}>Your feedback helps improve daily guidance.</Text>
          <View style={styles.feedbackRow}>
            <TouchableOpacity
              style={[styles.feedbackButton, activeState === 'helpful' && styles.feedbackButtonActive]}
              onPress={() => void saveFeedback('helpful')}
              disabled={Boolean(feedback)}
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
                if (feedback) return;
                setPendingNotUseful(true);
              }}
              disabled={Boolean(feedback)}
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
              <Text style={styles.reasonTitle}>What didn't fit?</Text>
              <View style={styles.reasonGrid}>
                {NOT_USEFUL_REASONS.map((reason) => (
                  <TouchableOpacity
                    key={reason}
                    style={styles.reasonChip}
                    onPress={() => void saveFeedback('not_useful', reason)}
                    disabled={Boolean(feedback)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.reasonChipText}>{reason}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.reasonSkip}
                onPress={() => void saveFeedback('not_useful', null)}
                disabled={Boolean(feedback)}
                activeOpacity={0.85}
              >
                <Text style={styles.reasonSkipText}>Skip</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {feedback ? <Text style={styles.feedbackThanks}>Thanks - your choice is saved for today.</Text> : null}
        </View>

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
  headerPanel: {
    zIndex: 10,
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
    justifyContent: 'space-between',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: 'white',
  },
  headerSubtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.78)',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  heroCard: {
    backgroundColor: '#F6FBF7',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#DCEFE4',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#E3F5EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    marginTop: 4,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    color: Colors.text,
  },
  heroBody: {
    marginTop: 16,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.text,
    fontWeight: '600',
  },
  guidanceMetaRow: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
  },
  metaChipText: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.primaryDark,
  },
  detailCard: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F5EA',
  },
  detailCopy: {
    flex: 1,
    minWidth: 0,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textLight,
  },
  feedbackCard: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  feedbackTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
  },
  feedbackSubtitle: {
    marginTop: 4,
    color: Colors.textLight,
    lineHeight: 19,
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
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
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
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
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
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  moreLinkText: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.secondary,
  },
  photoWrap: { height: 180, marginHorizontal: -18, marginTop: -18, marginBottom: 16, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden', backgroundColor: '#E6F2EF' },
  photo: { width: '100%', height: '100%' },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  photoShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 70 },
  personalBadge: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFE7A8', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  personalBadgeText: { fontSize: 11.5, fontWeight: '900', color: '#7A4B00' },
  personalStat: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF1E6', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12 },
  personalStatText: { flex: 1, fontSize: 13, fontWeight: '800', color: '#9C4221' },
});
