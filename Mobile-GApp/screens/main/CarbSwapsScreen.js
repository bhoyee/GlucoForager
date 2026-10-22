import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { apiFetch } from '../../utils/api';
import GlucoseImpactCard, { ImpactPill } from '../../components/GlucoseImpactCard';
import { API_URL } from '../../config/api';

const SWAPS = {
  rice: ['Cauliflower rice', 'Quinoa (small portion)', 'Konjac rice', 'Brown rice (small portion)'],
  bread: ['Whole grain bread (1 slice)', 'Low-carb wrap', 'Lettuce wrap', 'Sourdough (small portion)'],
  pasta: ['Zucchini noodles', 'Shirataki noodles', 'Spaghetti squash', 'Lentil pasta (small portion)'],
  potato: ['Sweet potato (small portion)', 'Roasted cauliflower', 'Turnips', 'Mixed veggies'],
  fries: ['Air-fried zucchini', 'Roasted carrots (small portion)', 'Side salad', 'Roasted broccoli'],
  cereal: ['Chia pudding', 'Greek yogurt + berries', 'Steel-cut oats (small portion)', 'Eggs + veg'],
  noodles: ['Shirataki noodles', 'Zucchini noodles', 'Bean sprouts', 'Cabbage stir-fry base'],
  tortillas: ['Low-carb wrap', 'Lettuce wrap', 'Cabbage wrap', 'Corn tortilla (small portion)'],
  pizza: ['Cauliflower crust', 'Thin crust + extra veg', 'Chicken crust', 'Pizza bowl (no crust)'],
  sugar: ['Stevia/erythritol (sparingly)', 'Cinnamon', 'Vanilla + berries', 'Unsweetened yogurt'],
  soda: ['Sparkling water', 'Diet soda (occasionally)', 'Unsweetened iced tea', 'Water + lemon'],
  juice: ['Water + fruit slices', 'Unsweetened tea', 'Diluted juice (small)', 'Eat whole fruit instead'],
  oats: ['Steel-cut oats (small portion)', 'Chia pudding', 'Greek yogurt bowl', 'Eggs + veg'],
  banana: ['1/2 banana + nut butter', 'Berries', 'Apple slices (small)', 'Kiwi'],
  crackers: ['Nuts', 'Cheese', 'Cucumber slices', 'Seed crackers'],
  chips: ['Roasted chickpeas (small)', 'Nuts (portion)', 'Popcorn (small)', 'Veg + dip'],
  icecream: ['Greek yogurt + berries', 'Sugar-free popsicle', 'Chia pudding', 'Dark chocolate (small)'],
};

const normalizeKey = (value) => `${value || ''}`.trim().toLowerCase().replace(/\s+/g, ' ');

const GOAL_LABELS = {
  lower_carb: 'Lower carb',
  high_protein: 'Higher protein',
  balanced: 'Balanced',
  weight_loss: 'Weight loss',
  quick_meals: 'Quick meals',
  simple_ingredients: 'Simple ingredients',
  budget_friendly: 'Budget-friendly',
  family_friendly: 'Family-friendly',
};

const ORIGINAL_VERDICT = {
  good_choice: { label: 'Good choice', color: '#2C8632', bg: '#E3F4E4', icon: 'checkmark-circle' },
  higher_impact: { label: 'Higher impact', color: '#C53030', bg: '#FDE2E2', icon: 'trending-up' },
  depends: { label: 'Depends on portion', color: '#B7791F', bg: '#FFF1D6', icon: 'scale' },
};
const IMPACT = {
  low: { label: 'Low impact', color: '#2C8632', bg: '#E3F4E4' },
  medium: { label: 'Medium impact', color: '#B7791F', bg: '#FFF1D6' },
  high: { label: 'High impact', color: '#C53030', bg: '#FDE2E2' },
};
const SUGGESTION_ICONS = {
  rice: 'restaurant', pasta: 'restaurant', bread: 'pizza', potato: 'nutrition', cereal: 'cafe',
  pizza: 'pizza', soda: 'beer', juice: 'wine', 'ice cream': 'ice-cream',
};

// Glycaemic index bar: green under 55, amber 56-69, red 70+ (the standard GI bands).
function GiMeter({ gi }) {
  const min = typeof gi?.min === 'number' ? gi.min : null;
  const max = typeof gi?.max === 'number' ? gi.max : min;
  if (min == null && max == null) return null;
  const lo = Math.max(0, Math.min(110, min ?? max));
  const hi = Math.max(lo, Math.min(110, max ?? min));
  const mid = (lo + hi) / 2;
  const band = mid < 56 ? { word: 'Low GI', color: '#2C8632' } : mid < 70 ? { word: 'Medium GI', color: '#B7791F' } : { word: 'High GI', color: '#C53030' };
  return (
    <View style={styles.giWrap}>
      <View style={styles.giHead}>
        <Text style={styles.giLabel}>Glycaemic index</Text>
        <Text style={[styles.giValue, { color: band.color }]}>
          {lo === hi ? lo : `${lo}-${hi}`} · {band.word}
        </Text>
      </View>
      <View style={styles.giTrack}>
        <View style={[styles.giZone, { flex: 55, backgroundColor: '#CDEBD0' }]} />
        <View style={[styles.giZone, { flex: 14, backgroundColor: '#FBE3B4' }]} />
        <View style={[styles.giZone, { flex: 41, backgroundColor: '#F8CACA' }]} />
        <View style={[styles.giMark, { left: `${(lo / 110) * 100}%`, width: `${Math.max(((hi - lo) / 110) * 100, 2)}%`, backgroundColor: band.color }]} />
      </View>
    </View>
  );
}

// Food photo from the shared library; a soft placeholder while it is being made.
function FoodThumb({ uri, pending, size = 64, radius = 16, children }) {
  return (
    <View style={[styles.thumb, { width: size, height: size, borderRadius: radius }]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius }} />
      ) : pending ? (
        <ActivityIndicator size="small" color="#8B6BD9" />
      ) : (
        <Ionicons name="restaurant" size={Math.round(size * 0.36)} color="#B9A7E8" />
      )}
      {children}
    </View>
  );
}

export default function CarbSwapsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom + 12, 12);
  const [query, setQuery] = useState(() => String(route.params?.query || '').slice(0, 60));
  const [isFocused, setIsFocused] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [aiErrorCode, setAiErrorCode] = useState(null);
  const [aiSuggestedQuery, setAiSuggestedQuery] = useState(null);
  const [shouldUpgrade, setShouldUpgrade] = useState(false);
  const [loading, setLoading] = useState(false);
  const lastRequestIdRef = useRef(0);
  // Library photos by food name, and names still being generated.
  const [images, setImages] = useState({});
  const [pendingImages, setPendingImages] = useState([]);

  const suggestions = useMemo(
    () => ['rice', 'pasta', 'bread', 'potato', 'cereal', 'pizza', 'soda', 'juice', 'ice cream'],
    []
  );

  const matches = useMemo(() => {
    const key = normalizeKey(query);
    if (!key) return null;

    const keyNoSpaces = key.replace(/\s+/g, '');
    if (keyNoSpaces === 'icecream') return { key: 'ice cream', items: SWAPS.icecream };
    if (key.includes('ice cream')) return { key: 'ice cream', items: SWAPS.icecream };

    if (SWAPS[key]) return { key, items: SWAPS[key] };
    const direct = Object.keys(SWAPS).find((k) => key.includes(k));
    if (direct) return { key: direct, items: SWAPS[direct] };
    return null;
  }, [query]);

  const fetchAiSwaps = async (food, { forceSwaps = true } = {}) => {
    const trimmed = String(food || '').trim();
    // Avoid noisy API calls for 1-character inputs while the user is typing.
    // Two-letter prefixes (e.g. "un") frequently cause backend clarifications; wait a bit longer.
    if (!trimmed || trimmed.length < 3) return;
    const requestId = Date.now();
    lastRequestIdRef.current = requestId;
    setLoading(true);
    setAiError(null);
    setAiErrorCode(null);
    setAiSuggestedQuery(null);
    setShouldUpgrade(false);

    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setAiError('Sign in required to use Food swaps.');
        setAiResult(null);
        return;
      }
      const response = await apiFetch(
        `${API_URL}/api/app/swaps`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ food: trimmed, force_swaps: Boolean(forceSwaps) }),
        },
        { timeoutMs: 65000 }
      );
      if (lastRequestIdRef.current !== requestId) return;
      if (!response.ok) {
        const data = await response.json();
        const detail = data?.detail;
        if (detail && typeof detail === 'object') {
          setAiError(String(detail.message || 'Swaps request failed.'));
          setAiErrorCode(String(detail.code || 'request_failed'));
          setShouldUpgrade(Boolean(detail.upgrade));
          setAiSuggestedQuery(typeof detail.suggested_query === 'string' ? detail.suggested_query : null);
        } else {
          setAiError(detail || 'Swaps request failed.');
          setAiErrorCode(response.status === 0 ? 'network_error' : 'request_failed');
          setAiSuggestedQuery(null);
          setShouldUpgrade(false);
        }
        setAiResult(null);
        return;
      }
      const data = await response.json();
      if (data?.swaps?.better_options?.length || data?.swaps?.options?.length) {
        setAiResult(data);
      } else {
        // Clarification / guidance path (server returns 200 with message + suggested_query).
        if (data?.message) {
          setAiError(String(data.message));
          setAiErrorCode('needs_clarification');
          setAiSuggestedQuery(typeof data.suggested_query === 'string' ? data.suggested_query : null);
          setAiResult(null);
          return;
        }
        setAiError('No swaps returned.');
        setAiResult(null);
      }
    } catch {
      if (lastRequestIdRef.current !== requestId) return;
      setAiError('Network request failed. Please check your connection.');
      setAiErrorCode('network_error');
      setAiSuggestedQuery(null);
      setAiResult(null);
    } finally {
      if (lastRequestIdRef.current === requestId) setLoading(false);
    }
  };

  useEffect(() => {
    if (!aiResult) {
      setImages({});
      setPendingImages([]);
      return;
    }
    const seed = {};
    if (aiResult.food && aiResult.original?.image_url) seed[aiResult.food] = aiResult.original.image_url;
    (aiResult.swaps?.options || []).forEach((o) => {
      if (o?.name && o?.image_url) seed[o.name] = o.image_url;
    });
    setImages(seed);
    setPendingImages(Array.isArray(aiResult.images_pending) ? aiResult.images_pending : []);
  }, [aiResult]);

  useEffect(() => {
    if (!pendingImages.length) return undefined;
    let cancelled = false;
    const started = Date.now();
    const poll = async () => {
      if (cancelled) return;
      try {
        const token = await AsyncStorage.getItem('userToken');
        const qs = pendingImages.map((n) => `name=${encodeURIComponent(n)}`).join('&');
        const res = await apiFetch(`${API_URL}/api/app/food-images?${qs}`, { headers: { Authorization: `Bearer ${token}` } }, { timeoutMs: 8000 });
        if (!cancelled && res.ok) {
          const data = await res.json();
          const got = Object.fromEntries(Object.entries(data?.images || {}).filter(([, u]) => u));
          if (Object.keys(got).length) setImages((prev) => ({ ...prev, ...got }));
          const still = pendingImages.filter((n) => !got[n] && (data?.pending || []).includes(n));
          if (still.length !== pendingImages.length) {
            setPendingImages(still);
            return;
          }
        }
      } catch {
        // Photos are optional.
      }
      if (cancelled) return;
      if (Date.now() - started > 45000) {
        setPendingImages([]);
        return;
      }
      timer = setTimeout(poll, 3000);
    };
    let timer = setTimeout(poll, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pendingImages]);

  useEffect(() => {
    const trimmed = String(query || '').trim();
    setAiResult(null);
    setAiError(null);
    setAiErrorCode(null);
    setAiSuggestedQuery(null);
    setShouldUpgrade(false);
    if (!trimmed || trimmed.length < 3) {
      setLoading(false);
      return;
    }
    const handle = setTimeout(() => {
      void fetchAiSwaps(trimmed, { forceSwaps: true });
    }, 450);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <View style={styles.container}>
      <View style={[styles.headerPanel, { paddingTop: headerPaddingTop }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Food Swaps</Text>
            <Text style={styles.headerSubtitle}>Find lower-impact alternatives</Text>
          </View>
          <View style={styles.headerRight} />
        </View>
      </View>
      <ScrollView
        style={{ marginTop: -28 }} showsVerticalScrollIndicator={false} contentContainerStyle={[{ paddingBottom: contentBottomPadding }, { paddingTop: 28 }]}>
        <View style={styles.body}>
          <View style={[styles.searchCard, isFocused && styles.searchCardFocused]}>
            <View style={styles.searchIcon}>
              <Ionicons name="swap-horizontal" size={18} color="white" />
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="What do you want to swap? e.g. rice"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
              maxLength={60}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery('')} style={styles.clearButton} activeOpacity={0.85}>
                <Ionicons name="close" size={16} color={Colors.textLight} />
              </TouchableOpacity>
            ) : null}
          </View>

          {!query ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Popular swaps</Text>
              <Text style={styles.cardSub}>Tap one, or type any food or drink</Text>
              <View style={styles.pills}>
                {suggestions.map((item) => (
                  <TouchableOpacity key={item} style={styles.pill} onPress={() => setQuery(item)} activeOpacity={0.85}>
                    <Ionicons name={SUGGESTION_ICONS[item] || 'restaurant'} size={14} color="#6B46C1" />
                    <Text style={styles.pillText}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.howRow}>
                {[
                  ['search', 'Search a food'],
                  ['analytics', 'See its glucose impact'],
                  ['swap-horizontal', 'Pick a better swap'],
                ].map(([icon, text]) => (
                  <View key={text} style={styles.howItem}>
                    <View style={styles.howIcon}>
                      <Ionicons name={icon} size={16} color={Colors.primary} />
                    </View>
                    <Text style={styles.howText}>{text}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : loading ? (
            <View style={[styles.card, styles.loadingCard]}>
              <ActivityIndicator size="small" color="#6B46C1" />
              <Text style={styles.loadingText}>Finding better swaps for "{query.trim()}"…</Text>
            </View>
          ) : aiResult ? (
            <>
              {/* What you searched */}
              <View style={styles.card}>
                <View style={styles.originalTop}>
                  <FoodThumb uri={images[aiResult.food]} pending={pendingImages.includes(aiResult.food)} size={76} radius={18} />
                  <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>You searched</Text>
                <View style={styles.originalHead}>
                  <Text style={styles.originalName}>{aiResult.food}</Text>
                  {aiResult.original?.verdict && ORIGINAL_VERDICT[aiResult.original.verdict] ? (
                    <View style={[styles.verdictPill, { backgroundColor: ORIGINAL_VERDICT[aiResult.original.verdict].bg }]}>
                      <Ionicons
                        name={ORIGINAL_VERDICT[aiResult.original.verdict].icon}
                        size={13}
                        color={ORIGINAL_VERDICT[aiResult.original.verdict].color}
                      />
                      <Text style={[styles.verdictText, { color: ORIGINAL_VERDICT[aiResult.original.verdict].color }]}>
                        {ORIGINAL_VERDICT[aiResult.original.verdict].label}
                      </Text>
                    </View>
                  ) : null}
                </View>
                  </View>
                </View>
                {aiResult.original?.summary ? <Text style={styles.originalSummary}>{aiResult.original.summary}</Text> : null}
                {aiResult.original?.watch_outs?.length ? (
                  <View style={styles.subBlock}>
                    <Text style={styles.subTitle}>Watch out for</Text>
                    {aiResult.original.watch_outs.map((w) => (
                      <View key={w} style={styles.bulletRow}>
                        <Ionicons name="alert-circle" size={15} color="#B7791F" />
                        <Text style={styles.bulletText}>{w}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {aiResult.original?.pair_with?.length ? (
                  <View style={styles.subBlock}>
                    <Text style={styles.subTitle}>Pair it with</Text>
                    <View style={styles.pairRow}>
                      {aiResult.original.pair_with.map((p) => (
                        <View key={p} style={styles.pairChip}>
                          <Ionicons name="add-circle" size={13} color="#2C8632" />
                          <Text style={styles.pairText}>{p}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>

              {/* Original vs the gentlest swap */}
              {(() => {
                const opts = (aiResult.swaps?.options || []).filter((o) => o?.glucose_impact);
                const best = opts.reduce((a, b) => (!a || b.glucose_impact.glycemic_load < a.glucose_impact.glycemic_load ? b : a), null);
                const orig = aiResult.original?.glucose_impact;
                if (!best && !orig) return null;
                return (
                  <GlucoseImpactCard
                    title={best && orig ? 'Glucose impact: swap vs original' : 'Estimated glucose impact'}
                    impact={best ? best.glucose_impact : orig}
                    compare={best && orig ? { impact: orig, label: aiResult.food, mainLabel: best.name } : null}
                  />
                );
              })()}

              {/* Better swaps */}
              {Array.isArray(aiResult.swaps?.options) && aiResult.swaps.options.length ? (
                <>
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionTitle}>Better swaps</Text>
                    <Text style={styles.sectionMeta}>{aiResult.swaps.options.length} ideas</Text>
                  </View>
                  {aiResult.swaps.options.map((opt, index) => {
                    const name = String(opt?.name || '').trim();
                    if (!name) return null;
                    const serving = typeof opt?.serving === 'string' ? opt.serving.trim() : '';
                    const macros = opt?.macros && typeof opt.macros === 'object' ? opt.macros : {};
                    const tags = Array.isArray(opt?.fit_tags) ? opt.fit_tags.filter((t) => GOAL_LABELS[t]).slice(0, 3) : [];
                    const impact = IMPACT[String(opt?.impact_label || '').toLowerCase()];
                    const macroTiles = [
                      ['Carbs', macros?.net_carbs_g, '#1D7C7A', '#E8F4F3'],
                      ['Fibre', macros?.fiber_g, '#2C8632', '#E9F6EA'],
                      ['Protein', macros?.protein_g, '#6B46C1', '#F0EBFB'],
                    ].filter(([, v]) => typeof v === 'number' && Number.isFinite(v));
                    return (
                      <View key={name} style={[styles.card, styles.swapCard]}>
                        <View style={styles.swapHead}>
                          <FoodThumb uri={images[name]} pending={pendingImages.includes(name)}>
                            <LinearGradient colors={['#8B6BD9', '#6B46C1']} style={styles.rank}>
                              <Text style={styles.rankText}>{index + 1}</Text>
                            </LinearGradient>
                          </FoodThumb>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.swapName}>{name}</Text>
                            {serving ? <Text style={styles.swapServing}>{serving}</Text> : null}
                          </View>
                          {opt?.glucose_impact ? (
                            <ImpactPill impact={opt.glucose_impact} small />
                          ) : impact ? (
                            <View style={[styles.impactPill, { backgroundColor: impact.bg }]}>
                              <Text style={[styles.impactText, { color: impact.color }]}>{impact.label}</Text>
                            </View>
                          ) : null}
                        </View>
                        {typeof opt?.reason === 'string' && opt.reason.trim() ? (
                          <Text style={styles.swapReason}>{opt.reason.trim()}</Text>
                        ) : null}
                        {macroTiles.length ? (
                          <View style={styles.macroRow}>
                            {macroTiles.map(([label, v, color, bg]) => (
                              <View key={label} style={[styles.macroTile, { backgroundColor: bg }]}>
                                <Text style={[styles.macroValue, { color }]}>{v}g</Text>
                                <Text style={styles.macroLabel}>{label}</Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                        <GiMeter gi={opt?.gi} />
                        {typeof opt?.portion_suggestion === 'string' && opt.portion_suggestion.trim() ? (
                          <View style={styles.portionRow}>
                            <Ionicons name="pie-chart" size={14} color={Colors.primary} />
                            <Text style={styles.portionText}>{opt.portion_suggestion.trim()}</Text>
                          </View>
                        ) : null}
                        {tags.length ? (
                          <View style={styles.tagRow}>
                            {tags.map((t) => (
                              <View key={t} style={styles.tagPill}>
                                <Text style={styles.tagText}>{GOAL_LABELS[t]}</Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </>
              ) : aiResult.swaps?.better_options?.length ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Better swaps</Text>
                  {aiResult.swaps.better_options.map((item) => (
                    <View key={item} style={styles.bulletRow}>
                      <Ionicons name="swap-horizontal" size={15} color="#6B46C1" />
                      <Text style={styles.bulletText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {aiResult.swaps?.why_these_are_better ? (
                <View style={[styles.note, { backgroundColor: '#E9F6EA', borderColor: '#CBE9CD' }]}>
                  <Ionicons name="bulb" size={18} color="#2C8632" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.noteTitle, { color: '#1F5E24' }]}>Why these are better</Text>
                    <Text style={styles.noteText}>{aiResult.swaps.why_these_are_better}</Text>
                  </View>
                </View>
              ) : null}
              {aiResult.swaps?.portion_tip ? (
                <View style={[styles.note, { backgroundColor: '#E8F4F3', borderColor: '#CDE7E4' }]}>
                  <Ionicons name="pie-chart" size={18} color={Colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.noteTitle, { color: Colors.primaryDark }]}>Portion tip</Text>
                    <Text style={styles.noteText}>{aiResult.swaps.portion_tip}</Text>
                  </View>
                </View>
              ) : null}
              <Text style={styles.disclaimer}>Glycaemic index and macros are estimates; portion size and cooking change the impact. Not medical advice.</Text>
            </>
          ) : matches && !aiError ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Swaps for {matches.key}</Text>
              {matches.items.map((item) => (
                <View key={item} style={styles.bulletRow}>
                  <Ionicons name="swap-horizontal" size={15} color="#6B46C1" />
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}
              <Text style={styles.disclaimer}>General suggestions. Portion size and your body's response matter.</Text>
            </View>
          ) : (
            <View style={[styles.card, styles.warnCard]}>
              <Ionicons name="information-circle" size={22} color="#B7791F" />
              <Text style={styles.warnText}>{aiError ? aiError : 'No swaps found yet for that term.'}</Text>
              {aiErrorCode === 'needs_clarification' && aiSuggestedQuery ? (
                <TouchableOpacity style={styles.secondaryButton} onPress={() => setQuery(aiSuggestedQuery)} activeOpacity={0.85}>
                  <Text style={styles.secondaryButtonText}>Search for “{aiSuggestedQuery}”</Text>
                  <Ionicons name="chevron-forward" size={16} color="#6B46C1" />
                </TouchableOpacity>
              ) : null}
              <Text style={styles.disclaimer}>
                {aiErrorCode === 'invalid_food_input' || aiErrorCode === 'not_food_or_drink' || aiErrorCode === 'needs_clarification'
                  ? 'Try a general food or drink (e.g. “bread”, “donut”, “soda”).'
                  : aiErrorCode === 'network_error'
                    ? 'Make sure your phone is online and the server is reachable.'
                    : 'Please try again in a moment.'}
              </Text>
              {shouldUpgrade ? (
                <TouchableOpacity
                  style={styles.upgradeButton}
                  onPress={() => navigation.getParent()?.navigate('Profile', { screen: 'ProfileMain', params: { openPremium: true } })}
                  activeOpacity={0.85}
                >
                  <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
                  <Ionicons name="chevron-forward" size={16} color="white" />
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>
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
    zIndex: 10, elevation: 5,
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 12 },
  headerRight: { width: 44, height: 44 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: 'white' },
  headerSubtitle: { marginTop: 3, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.78)' },
  body: { padding: 16, gap: 12 },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'white',
    borderRadius: 18,
    paddingHorizontal: 10,
    minHeight: 58,
    borderWidth: 1.5,
    borderColor: '#EDF0EA',
    ...CARD_SHADOW,
  },
  searchCardFocused: { borderColor: '#6B46C1' },
  searchIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#6B46C1', alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, fontSize: 16, color: Colors.brandNavy, fontWeight: '700', paddingVertical: 0 },
  clearButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  card: { backgroundColor: 'white', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#EDF0EA', ...CARD_SHADOW },
  cardTitle: { fontSize: 16.5, fontWeight: '900', color: Colors.brandNavy },
  cardSub: { marginTop: 3, fontSize: 12.5, color: Colors.textLight },
  pills: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#F0EBFB',
    borderWidth: 1,
    borderColor: '#DDD3F5',
  },
  pillText: { color: '#5B3BA6', fontWeight: '900', fontSize: 13, textTransform: 'capitalize' },
  howRow: { flexDirection: 'row', gap: 8, marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F0F2EC' },
  howItem: { flex: 1, alignItems: 'center', gap: 6 },
  howIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#E8F4F3', alignItems: 'center', justifyContent: 'center' },
  howText: { fontSize: 11.5, fontWeight: '800', color: Colors.brandNavy, textAlign: 'center' },
  loadingCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingText: { flex: 1, fontSize: 14, color: Colors.textLight, fontWeight: '700' },
  eyebrow: { fontSize: 11.5, fontWeight: '900', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  originalTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  originalHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  originalName: { fontSize: 22, fontWeight: '900', color: Colors.brandNavy, textTransform: 'capitalize' },
  verdictPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  verdictText: { fontSize: 12, fontWeight: '900' },
  originalSummary: { fontSize: 14, lineHeight: 20, color: Colors.brandNavy, marginTop: 8 },
  subBlock: { marginTop: 12 },
  subTitle: { fontSize: 12, fontWeight: '900', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  bulletRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  bulletText: { flex: 1, fontSize: 13.5, lineHeight: 19, color: Colors.brandNavy },
  pairRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pairChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E9F6EA', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  pairText: { fontSize: 12.5, fontWeight: '800', color: '#1F5E24' },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: Colors.brandNavy },
  sectionMeta: { fontSize: 12.5, fontWeight: '800', color: Colors.textLight },
  swapCard: { gap: 10 },
  swapHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { backgroundColor: '#F3EFFC', alignItems: 'center', justifyContent: 'center' },
  rank: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { color: 'white', fontWeight: '900', fontSize: 12 },
  swapName: { fontSize: 16, fontWeight: '900', color: Colors.brandNavy },
  swapServing: { fontSize: 12, color: Colors.textLight, marginTop: 1 },
  impactPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  impactText: { fontSize: 11, fontWeight: '900' },
  swapReason: { fontSize: 13.5, lineHeight: 19, color: Colors.brandNavy },
  macroRow: { flexDirection: 'row', gap: 8 },
  macroTile: { flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  macroValue: { fontSize: 16, fontWeight: '900' },
  macroLabel: { fontSize: 11, fontWeight: '800', color: Colors.textLight, marginTop: 1 },
  giWrap: { gap: 6 },
  giHead: { flexDirection: 'row', justifyContent: 'space-between' },
  giLabel: { fontSize: 12, fontWeight: '800', color: Colors.textLight },
  giValue: { fontSize: 12, fontWeight: '900' },
  giTrack: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', position: 'relative' },
  giZone: { height: '100%' },
  giMark: { position: 'absolute', top: 0, bottom: 0, borderRadius: 4 },
  portionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F4FAF9', borderRadius: 10, padding: 8 },
  portionText: { flex: 1, fontSize: 12.5, color: Colors.brandNavy, fontWeight: '700' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: '#F1F5F9' },
  tagText: { fontSize: 11.5, fontWeight: '800', color: '#475569' },
  note: { flexDirection: 'row', gap: 10, borderRadius: 18, padding: 14, borderWidth: 1 },
  noteTitle: { fontSize: 13.5, fontWeight: '900', marginBottom: 3 },
  noteText: { fontSize: 13.5, lineHeight: 19, color: Colors.brandNavy },
  warnCard: { backgroundColor: '#FFF8E6', borderColor: '#F6D9A0', gap: 8 },
  warnText: { fontSize: 14, fontWeight: '800', color: '#7B4A0B' },
  disclaimer: { fontSize: 11.5, lineHeight: 16, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 8 },
  secondaryButton: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#DDD3F5',
    backgroundColor: '#F0EBFB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secondaryButtonText: { fontSize: 14, fontWeight: '900', color: '#6B46C1' },
  upgradeButton: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  upgradeButtonText: { fontSize: 14, fontWeight: '900', color: 'white' },
});
