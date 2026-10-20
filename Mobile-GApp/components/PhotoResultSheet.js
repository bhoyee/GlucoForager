// components/PhotoResultSheet.js
// Snap-a-meal result: the photo, verdict, carbs vs the user's meal budget, what's on the
// plate (carbs per component), nutrition estimate and insights. Values are AI estimates
// from the photo; the backend adds the meal-budget insights (services/food_label.py).
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../constants/Colors';
import GlucoseImpactCard from './GlucoseImpactCard';

const VERDICTS = {
  good_fit: { label: 'Good choice', sub: 'Looks gentle on blood sugar', icon: 'checkmark-circle', colors: ['#3FA046', '#2C8632'] },
  moderate: { label: 'Okay in moderation', sub: 'Mind the portion and what you pair it with', icon: 'alert-circle', colors: ['#E8A317', '#C47F0A'] },
  use_caution: { label: 'Use caution', sub: 'Likely to raise blood sugar quickly', icon: 'warning', colors: ['#E05353', '#C53030'] },
  unknown: { label: 'Not enough info', sub: "We couldn't estimate the nutrition well", icon: 'help-circle', colors: ['#8A99A8', '#64748B'] },
};
const TONE = {
  good: { icon: 'checkmark-circle', color: '#2C8632' },
  warn: { icon: 'alert-circle', color: '#C47F0A' },
  info: { icon: 'bulb', color: '#2B6CB0' },
};
const NUTRIENTS = [
  ['Sugars', 'sugars_g', 'g', '#C53030', '#FDECEC'],
  ['Fibre', 'fiber_g', 'g', '#2C8632', '#E9F6EA'],
  ['Protein', 'protein_g', 'g', '#6B46C1', '#F0EBFB'],
  ['Fat', 'fat_g', 'g', '#B7791F', '#FFF8E6'],
  ['Calories', 'calories', '', '#DD6B20', '#FFF1E6'],
];
const CONFIDENCE = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };

export default function PhotoResultSheet({ result, photoUri, top, bottom, isSaving, onLog, onScanAgain, onFindSwap }) {
  const verdict = VERDICTS[result?.diabetes_note?.verdict] || VERDICTS.unknown;
  const share = result.meal_share;
  const carbs = result.carbs_g;
  const pct = share?.pct_of_meal;
  const barColor = pct == null ? Colors.primary : pct > 100 ? '#C53030' : pct > 60 ? '#C47F0A' : '#2C8632';
  const maxItem = Math.max(1, ...(result.items || []).map((i) => i.carbs_g || 0));

  return (
    <View style={[styles.sheet, { top }]}>
      <View style={styles.grabber} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: bottom + 20, gap: 12 }}>
        <View style={styles.product}>
          {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>From your photo</Text>
            <Text style={styles.name} numberOfLines={3}>{result.name || 'Your meal'}</Text>
            <Text style={styles.meta}>
              {[result.portion, CONFIDENCE[result.confidence]].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        <LinearGradient colors={verdict.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.verdict}>
          <View style={styles.verdictIcon}>
            <Ionicons name={verdict.icon} size={26} color="white" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.verdictLabel}>{verdict.label}</Text>
            <Text style={styles.verdictSub}>{verdict.sub}</Text>
          </View>
        </LinearGradient>

        {carbs != null ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Carbs (estimate)</Text>
            <Text style={styles.cardCaption}>
              {share ? `This meal vs a typical meal for your ${share.daily_goal_g}g daily goal` : 'For the portion in the photo'}
            </Text>
            <View style={styles.carbRow}>
              <Text style={styles.carbBig}>
                {Math.round(carbs)}
                <Text style={styles.carbUnit}>g</Text>
              </Text>
              {share ? (
                <View style={{ flex: 1 }}>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }]} />
                  </View>
                  <Text style={styles.barText}>
                    <Text style={{ color: barColor, fontWeight: '900' }}>{pct}%</Text> of a {share.meal_budget_g}g meal
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        <GlucoseImpactCard impact={result.glucose_impact} lastTime={result.last_time} />

        {result.items?.length ? (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { marginBottom: 10 }]}>What's on the plate</Text>
            {result.items.map((item) => (
              <View key={item.name} style={styles.itemRow}>
                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                <View style={styles.itemTrack}>
                  <LinearGradient
                    colors={['#35C0BD', '#1D7C7A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.itemFill, { width: `${Math.max((item.carbs_g / maxItem) * 100, 4)}%` }]}
                  />
                </View>
                <Text style={styles.itemCarbs}>{item.carbs_g}g</Text>
              </View>
            ))}
            <Text style={styles.cardCaption}>Carbs by component</Text>
          </View>
        ) : null}

        {result.insights?.length ? (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { marginBottom: 6 }]}>What this means for you</Text>
            {result.insights.map((item) => {
              const tone = TONE[item.tone] || TONE.info;
              return (
                <View key={item.text} style={styles.insight}>
                  <Ionicons name={tone.icon} size={18} color={tone.color} />
                  <Text style={styles.insightText}>{item.text}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {NUTRIENTS.some(([, key]) => result[key] != null) ? (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { marginBottom: 10 }]}>Nutrition estimate</Text>
            <View style={styles.tiles}>
              {NUTRIENTS.filter(([, key]) => result[key] != null).map(([label, key, unit, color, bg]) => (
                <View key={key} style={[styles.tile, { backgroundColor: bg }]}>
                  <Text style={[styles.tileValue, { color }]}>
                    {Math.round(result[key])}
                    {unit}
                  </Text>
                  <Text style={styles.tileLabel}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Text style={styles.disclaimer}>Estimated from a photo. A rough guide, not an exact measurement or medical advice.</Text>

        <TouchableOpacity onPress={onLog} disabled={isSaving} activeOpacity={0.9} style={styles.primaryShadow}>
          <LinearGradient colors={['#23807E', '#0B5A46']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
            {isSaving ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="white" />
                <Text style={styles.primaryText}>I ate this{carbs != null ? ` · ~${Math.round(carbs)}g carbs` : ''}</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
        <View style={styles.secondaryRow}>
          <TouchableOpacity style={[styles.secondary, styles.swapBtn]} onPress={onFindSwap} activeOpacity={0.85}>
            <Ionicons name="swap-horizontal" size={17} color="#6B46C1" />
            <Text style={[styles.secondaryText, { color: '#6B46C1' }]}>Find a swap</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={onScanAgain} activeOpacity={0.85}>
            <Ionicons name="camera" size={17} color={Colors.primary} />
            <Text style={styles.secondaryText}>Scan again</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
  },
  grabber: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#D5DBD0', marginTop: 8 },
  product: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photo: { width: 76, height: 76, borderRadius: 18, backgroundColor: '#E5E7EB' },
  eyebrow: { fontSize: 11.5, fontWeight: '900', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  name: { fontSize: 19, fontWeight: '900', color: Colors.brandNavy, marginTop: 2, lineHeight: 24 },
  meta: { fontSize: 12.5, color: Colors.textLight, marginTop: 3 },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 16 },
  verdictIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  verdictLabel: { fontSize: 19, fontWeight: '900', color: 'white' },
  verdictSub: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  card: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EDF0EA',
    shadowColor: '#0F2A3A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  cardTitle: { fontSize: 16, fontWeight: '900', color: Colors.brandNavy },
  cardCaption: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  carbRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 },
  carbBig: { fontSize: 40, fontWeight: '900', color: Colors.brandNavy },
  carbUnit: { fontSize: 18, color: Colors.textLight },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: '#EEF1EA', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  barText: { fontSize: 13, color: Colors.textLight, marginTop: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  itemName: { width: 110, fontSize: 13.5, fontWeight: '800', color: Colors.brandNavy },
  itemTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#EEF1EA', overflow: 'hidden' },
  itemFill: { height: '100%', borderRadius: 4 },
  itemCarbs: { width: 40, textAlign: 'right', fontSize: 13, fontWeight: '900', color: Colors.primary },
  insight: { flexDirection: 'row', gap: 10, paddingVertical: 7 },
  insightText: { flex: 1, fontSize: 14, lineHeight: 20, color: Colors.brandNavy },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexGrow: 1, flexBasis: '30%', borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  tileValue: { fontSize: 17, fontWeight: '900' },
  tileLabel: { fontSize: 11.5, fontWeight: '800', color: Colors.textLight, marginTop: 1 },
  disclaimer: { fontSize: 11.5, color: Colors.textMuted, textAlign: 'center', lineHeight: 16, paddingHorizontal: 8 },
  primaryShadow: {
    borderRadius: 16,
    shadowColor: '#0B5A46',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  primary: { height: 54, borderRadius: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: 'white', fontSize: 16, fontWeight: '900' },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondary: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F4F3',
    borderWidth: 1.5,
    borderColor: '#CDE7E4',
  },
  swapBtn: { backgroundColor: '#F0EBFB', borderColor: '#DDD3F5' },
  secondaryText: { fontSize: 14, fontWeight: '900', color: Colors.primary },
});
