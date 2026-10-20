// components/BarcodeResultSheet.js
// Full barcode result: product, verdict, carbs vs the user's meal budget, UK front-of-pack
// traffic lights, Nutri-Score / processing, insights and the full label. All analysis
// comes from the backend (services/food_label.py); this only presents it.
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../constants/Colors';
import GlucoseImpactCard from './GlucoseImpactCard';
import { countryName } from '../utils/region';

const VERDICTS = {
  good_fit: { label: 'Good choice', sub: 'Fits a blood-sugar-friendly diet', icon: 'checkmark-circle', colors: ['#3FA046', '#2C8632'] },
  moderate: { label: 'Okay in moderation', sub: 'Mind the portion and what you pair it with', icon: 'alert-circle', colors: ['#E8A317', '#C47F0A'] },
  use_caution: { label: 'Use caution', sub: 'Likely to raise blood sugar quickly', icon: 'warning', colors: ['#E05353', '#C53030'] },
  unknown: { label: 'Not enough info', sub: 'The label is missing key nutrition data', icon: 'help-circle', colors: ['#8A99A8', '#64748B'] },
};
const LIGHT = {
  low: { word: 'Low', bg: '#E3F4E4', fg: '#1F7A2A' },
  medium: { word: 'Medium', bg: '#FFF1D6', fg: '#A15C00' },
  high: { word: 'High', bg: '#FDE2E2', fg: '#B42323' },
};
const NUTRISCORE = { a: '#038141', b: '#85BB2F', c: '#FECB02', d: '#EE8100', e: '#E63E11' };
const TONE = {
  good: { icon: 'checkmark-circle', color: '#2C8632' },
  warn: { icon: 'alert-circle', color: '#C47F0A' },
  info: { icon: 'information-circle', color: '#2B6CB0' },
};
const ROWS = [
  ['Energy', 'calories', ' kcal'],
  ['Carbohydrate', 'carbs_g', 'g'],
  ['of which sugars', 'sugars_g', 'g', true],
  ['Fibre', 'fiber_g', 'g'],
  ['Net carbs', 'net_carbs_g', 'g'],
  ['Protein', 'protein_g', 'g'],
  ['Fat', 'fat_g', 'g'],
  ['of which saturates', 'saturates_g', 'g', true],
  ['Salt', 'salt_g', 'g'],
];

const fmt = (v, unit) => (v == null ? '–' : `${Number(v) % 1 ? Number(v).toFixed(1) : v}${unit}`);

function Card({ title, caption, children, right }) {
  return (
    <View style={styles.card}>
      {title ? (
        <View style={styles.cardHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{title}</Text>
            {caption ? <Text style={styles.cardCaption}>{caption}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export default function BarcodeResultSheet({ result, top, bottom, isSaving, onLog, onScanAgain, onFindSwap, onPhotoScan, onChangeCountry, notice }) {
  const verdict = VERDICTS[result?.diabetes_note?.verdict] || VERDICTS.unknown;
  const share = result.meal_share;
  const perServing = result.per_serving;
  const per100 = result.per_100g || {};
  const carbs = perServing?.carbs_g ?? result.carbs_g;
  const sharePct = share?.pct_of_meal;
  const barColor = sharePct == null ? Colors.primary : sharePct > 100 ? '#C53030' : sharePct > 60 ? '#C47F0A' : '#2C8632';

  return (
    <View style={[styles.sheet, { top }]}>
      <View style={styles.grabber} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: bottom + 20, gap: 12 }}>
        {notice ? (
          <View style={styles.notice}>
            <Ionicons name="barcode" size={18} color="#2C8632" />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        {/* Product */}
        <View style={styles.product}>
          {result.image_url ? (
            <Image source={{ uri: result.image_url }} style={styles.productImage} resizeMode="contain" />
          ) : (
            <View style={[styles.productImage, styles.productImageEmpty]}>
              <Ionicons name="barcode-outline" size={26} color={Colors.textLight} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            {result.brand ? <Text style={styles.brand} numberOfLines={1}>{result.brand}</Text> : null}
            <Text style={styles.name} numberOfLines={3}>{result.name}</Text>
            {result.serving_size ? <Text style={styles.serving}>Serving: {result.serving_size}</Text> : null}
          </View>
        </View>

        {/* Verdict */}
        <LinearGradient colors={verdict.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.verdict}>
          <View style={styles.verdictIcon}>
            <Ionicons name={verdict.icon} size={26} color="white" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.verdictLabel}>{verdict.label}</Text>
            <Text style={styles.verdictSub}>{verdict.sub}</Text>
          </View>
        </LinearGradient>

        {/* Carbs vs the user's meal budget */}
        {carbs != null ? (
          <Card
            title="Carbs"
            caption={share ? `One serving vs a typical meal for your ${share.daily_goal_g}g daily goal` : perServing?.carbs_g != null ? 'Per serving' : 'Per 100g'}
          >
            <View style={styles.carbRow}>
              <Text style={styles.carbBig}>
                {fmt(carbs, '')}
                <Text style={styles.carbUnit}>g</Text>
              </Text>
              {share ? (
                <View style={{ flex: 1 }}>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.min(sharePct, 100)}%`, backgroundColor: barColor }]} />
                  </View>
                  <Text style={styles.barText}>
                    <Text style={{ color: barColor, fontWeight: '900' }}>{sharePct}%</Text> of a {share.meal_budget_g}g meal
                  </Text>
                </View>
              ) : null}
            </View>
          </Card>
        ) : null}

        {/* Typical 2-hour glucose response + the user's own last reading */}
        <GlucoseImpactCard impact={result.glucose_impact} lastTime={result.last_time} />

        {/* Insights */}
        {result.insights?.length ? (
          <Card title="What this means for you">
            {result.insights.map((item) => {
              const tone = TONE[item.tone] || TONE.info;
              return (
                <View key={item.text} style={styles.insight}>
                  <Ionicons name={tone.icon} size={18} color={tone.color} />
                  <Text style={styles.insightText}>{item.text}</Text>
                </View>
              );
            })}
          </Card>
        ) : null}

        {/* UK traffic lights */}
        {result.traffic_lights?.length ? (
          <Card title={result.rating_system === 'uk_fsa' || !result.rating_system ? 'Traffic lights' : 'Daily Value'} caption={result.traffic_light_standard}>
            <View style={styles.lights}>
              {result.traffic_lights.map((l) => {
                const s = LIGHT[l.level];
                return (
                  <View key={l.key} style={[styles.light, { backgroundColor: s.bg }]}>
                    <Text style={[styles.lightLabel, { color: s.fg }]}>{l.label}</Text>
                    <Text style={styles.lightValue}>
                      {l.pct_dv != null ? `${l.pct_dv}%` : fmt(l.value_g, 'g')}
                    </Text>
                    {l.pct_dv != null ? (
                      <Text style={styles.lightSub}>{l.value_mg != null ? `${l.value_mg}mg` : fmt(l.value_g, 'g')}</Text>
                    ) : null}
                    <View style={[styles.lightPill, { backgroundColor: s.fg }]}>
                      <Text style={styles.lightPillText}>{s.word}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
            <TouchableOpacity style={styles.countryRow} onPress={onChangeCountry} hitSlop={6}>
              <Ionicons name="globe-outline" size={13} color={Colors.textLight} />
              <Text style={styles.countryText}>
                {countryName(result.rating_country) ? `Ratings for ${countryName(result.rating_country)}` : 'Ratings for your country'}
                <Text style={styles.link}> · Change</Text>
              </Text>
            </TouchableOpacity>
          </Card>
        ) : null}

        {/* Scores */}
        {result.nutriscore_grade && NUTRISCORE[result.nutriscore_grade] || result.nova_group ? (
          <View style={styles.scores}>
            {result.nutriscore_grade && NUTRISCORE[result.nutriscore_grade] ? (
              <View style={[styles.card, styles.scoreCard]}>
                <Text style={styles.scoreTitle}>Nutri-Score</Text>
                <View style={styles.nutriRow}>
                  {['a', 'b', 'c', 'd', 'e'].map((g) => {
                    const on = g === result.nutriscore_grade;
                    return (
                      <View key={g} style={[styles.nutriCell, { backgroundColor: NUTRISCORE[g], opacity: on ? 1 : 0.28 }, on && styles.nutriOn]}>
                        <Text style={[styles.nutriLetter, on && { fontSize: 16 }]}>{g.toUpperCase()}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
            {result.nova_group ? (
              <View style={[styles.card, styles.scoreCard]}>
                <Text style={styles.scoreTitle}>Processing</Text>
                <Text style={[styles.novaValue, { color: result.nova_group >= 4 ? '#C53030' : result.nova_group === 3 ? '#C47F0A' : '#2C8632' }]}>
                  NOVA {result.nova_group}
                </Text>
                <Text style={styles.novaLabel} numberOfLines={2}>{result.nova_label}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Full label */}
        {result.has_nutrition_data !== false ? (
          <Card title="Nutrition label">
            <View style={[styles.tRow, styles.tHead]}>
              <Text style={[styles.tCell, styles.tName]} />
              {perServing ? <Text style={styles.tHeadText}>Serving</Text> : null}
              <Text style={styles.tHeadText}>{result.is_drink ? '100ml' : '100g'}</Text>
            </View>
            {ROWS.map(([label, key, unit, sub]) =>
              perServing?.[key] == null && per100[key] == null ? null : (
                <View key={key} style={styles.tRow}>
                  <Text style={[styles.tCell, styles.tName, sub && styles.tSub]}>{label}</Text>
                  {perServing ? <Text style={styles.tVal}>{fmt(perServing[key], unit)}</Text> : null}
                  <Text style={styles.tVal}>{fmt(per100[key], unit)}</Text>
                </View>
              )
            )}
          </Card>
        ) : (
          <View style={styles.noData}>
            <Ionicons name="information-circle" size={18} color={Colors.primary} />
            <Text style={styles.noDataText}>
              No nutrition label on file for this barcode, common for fresh produce. A photo scan can estimate it instead.
            </Text>
            <TouchableOpacity onPress={onPhotoScan} hitSlop={8}>
              <Text style={styles.link}>Photo scan</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.disclaimer}>
          Data from Open Food Facts. Traffic lights follow UK Food Standards Agency guidance. A general guide, not medical advice.
        </Text>

        {/* Actions */}
        <TouchableOpacity onPress={onLog} disabled={isSaving} activeOpacity={0.9} style={styles.primaryShadow}>
          <LinearGradient colors={['#23807E', '#0B5A46']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
            {isSaving ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="white" />
                <Text style={styles.primaryText}>I ate this{carbs != null ? ` · ${Math.round(carbs)}g carbs` : ''}</Text>
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
            <Ionicons name="scan" size={17} color={Colors.primary} />
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
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: '#E9F6EA', borderWidth: 1, borderColor: '#CBE9CD' },
  noticeText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1F5E24' },
  product: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  productImage: { width: 72, height: 72, borderRadius: 16, backgroundColor: 'white', borderWidth: 1, borderColor: '#EDF0EA' },
  productImageEmpty: { alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 12, fontWeight: '800', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  name: { fontSize: 19, fontWeight: '900', color: Colors.brandNavy, marginTop: 2, lineHeight: 24 },
  serving: { fontSize: 12.5, color: Colors.textLight, marginTop: 3 },
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
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '900', color: Colors.brandNavy },
  cardCaption: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  carbRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  carbBig: { fontSize: 40, fontWeight: '900', color: Colors.brandNavy },
  carbUnit: { fontSize: 18, color: Colors.textLight },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: '#EEF1EA', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  barText: { fontSize: 13, color: Colors.textLight, marginTop: 6 },
  insight: { flexDirection: 'row', gap: 10, paddingVertical: 7 },
  insightText: { flex: 1, fontSize: 14, lineHeight: 20, color: Colors.brandNavy },
  lights: { flexDirection: 'row', gap: 8 },
  light: { flex: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', gap: 4 },
  lightLabel: { fontSize: 11.5, fontWeight: '900' },
  lightValue: { fontSize: 15, fontWeight: '900', color: Colors.brandNavy },
  lightSub: { fontSize: 10.5, fontWeight: '700', color: Colors.textLight, marginTop: -2 },
  lightPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  lightPillText: { fontSize: 10.5, fontWeight: '900', color: 'white' },
  scores: { flexDirection: 'row', gap: 12 },
  scoreCard: { flex: 1, padding: 14 },
  scoreTitle: { fontSize: 12, fontWeight: '800', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 },
  nutriRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  nutriCell: { flex: 1, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  nutriOn: { height: 34, borderRadius: 8 },
  nutriLetter: { color: 'white', fontWeight: '900', fontSize: 12 },
  novaValue: { fontSize: 20, fontWeight: '900' },
  novaLabel: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  tRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F2EC' },
  tHead: { paddingTop: 0 },
  tHeadText: { width: 76, textAlign: 'right', fontSize: 12, fontWeight: '800', color: Colors.textLight },
  tCell: { fontSize: 14, color: Colors.brandNavy },
  tName: { flex: 1, fontWeight: '700' },
  tSub: { fontWeight: '500', color: Colors.textLight, paddingLeft: 12 },
  tVal: { width: 76, textAlign: 'right', fontSize: 14, fontWeight: '800', color: Colors.brandNavy },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  countryText: { fontSize: 12, color: Colors.textLight, fontWeight: '700' },
  noData: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: '#E8F4F3' },
  noDataText: { flex: 1, fontSize: 13, color: Colors.brandNavy, lineHeight: 18 },
  link: { fontSize: 13, fontWeight: '900', color: Colors.primary },
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
