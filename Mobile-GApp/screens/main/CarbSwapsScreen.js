import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { apiFetch } from '../../utils/api';
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

const formatGi = (gi) => {
  const min = gi && typeof gi === "object" ? gi.min : null;
  const max = gi && typeof gi === "object" ? gi.max : null;
  if (typeof min === "number" && typeof max === "number") return `${min}-${max}`;
  if (typeof min === "number") return `${min}+`;
  if (typeof max === "number") return `<=${max}`;
  return null;
};

const formatMacro = (value) => (typeof value === 'number' && Number.isFinite(value) ? `${value}g` : null);

const impactTone = (impact) => {
  const v = String(impact || '').toLowerCase();
  if (v === 'low') return { bg: 'rgba(16, 185, 129, 0.12)', fg: 'rgba(16, 185, 129, 1)' };
  if (v === 'medium') return { bg: 'rgba(245, 158, 11, 0.14)', fg: 'rgba(245, 158, 11, 1)' };
  if (v === 'high') return { bg: 'rgba(239, 68, 68, 0.12)', fg: 'rgba(239, 68, 68, 1)' };
  return { bg: 'rgba(59, 130, 246, 0.12)', fg: Colors.secondary };
};

export default function CarbSwapsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom + 12, 12);
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [aiErrorCode, setAiErrorCode] = useState(null);
  const [aiSuggestedQuery, setAiSuggestedQuery] = useState(null);
  const [shouldUpgrade, setShouldUpgrade] = useState(false);
  const [loading, setLoading] = useState(false);
  const lastRequestIdRef = useRef(0);

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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: contentBottomPadding }}>
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
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="swap-horizontal-outline" size={20} color={Colors.secondary} />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Find a diabetes-friendlier alternative</Text>
            <Text style={styles.heroSub}>
              Type a food and get quick swap ideas. These are general suggestions - portion size still matters.
            </Text>
          </View>
        </View>

        <View style={[styles.searchWrap, isFocused && styles.searchWrapFocused]}>
          <Ionicons name="search-outline" size={18} color={Colors.textLight} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Search a food (e.g. rice, bread, soda)"
            placeholderTextColor={Colors.textLight}
            style={styles.input}
            maxLength={25}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')} style={styles.clearButton} activeOpacity={0.85}>
              <Ionicons name="close" size={18} color={Colors.textLight} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.cardAccent} pointerEvents="none" />
          <Text style={styles.cardTitle}>Swap ideas</Text>

          {!query ? (
            <>
              <Text style={styles.cardSub}>Popular searches</Text>
              <View style={styles.pills}>
                {suggestions.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={styles.pill}
                    onPress={() => setQuery(item)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.pillText}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.disclaimer}>Tip: start with a general word (e.g. "bread" instead of a brand name).</Text>
            </>
          ) : loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={Colors.secondary} />
              <Text style={styles.loadingText}>Finding swaps...</Text>
            </View>
          ) : aiResult ? (
            <>
              {aiResult.swaps?.better_options?.length ? (
                <>
                  <Text style={styles.cardSub}>
                    Better options for <Text style={styles.bold}>{aiResult.food}</Text>
                  </Text>
                  {Array.isArray(aiResult.swaps?.options) && aiResult.swaps.options.length ? (
                    <View style={styles.swapCards}>
                      {aiResult.swaps.options.map((opt) => {
                        const name = String(opt?.name || '').trim();
                        if (!name) return null;
                        const giText = formatGi(opt?.gi);
                        const serving = typeof opt?.serving === 'string' ? opt.serving.trim() : '';
                        const macros = opt?.macros && typeof opt.macros === 'object' ? opt.macros : {};
                        const netCarbs = formatMacro(macros?.net_carbs_g);
                        const fiber = formatMacro(macros?.fiber_g);
                        const protein = formatMacro(macros?.protein_g);
                        const tags = Array.isArray(opt?.fit_tags) ? opt.fit_tags.filter((t) => GOAL_LABELS[t]).slice(0, 3) : [];
                        const impact = typeof opt?.impact_label === 'string' ? opt.impact_label : null;
                        const tone = impactTone(impact);

                        return (
                          <View key={name} style={styles.swapCard}>
                            <View style={styles.swapCardAccent} pointerEvents="none" />
                            <View style={styles.swapCardHeader}>
                              <Text style={styles.swapCardTitle}>{name}</Text>
                              {impact ? (
                                <View style={[styles.impactPill, { backgroundColor: tone.bg }]}>
                                  <Text style={[styles.impactPillText, { color: tone.fg }]}>
                                    {String(impact).toUpperCase()} IMPACT
                                  </Text>
                                </View>
                              ) : null}
                            </View>

                            {(serving || giText || netCarbs || fiber || protein) ? (
                              <View style={styles.metaRow}>
                                {serving ? (
                                  <View style={styles.metaPill}>
                                    <Ionicons name="restaurant-outline" size={12} color={Colors.textLight} />
                                    <Text style={styles.metaPillText}>{serving}</Text>
                                  </View>
                                ) : null}
                                {giText ? (
                                  <View style={styles.metaPill}>
                                    <Ionicons name="pulse-outline" size={12} color={Colors.textLight} />
                                    <Text style={styles.metaPillText}>Glycemic index {giText}</Text>
                                  </View>
                                ) : null}
                                {netCarbs ? (
                                  <View style={styles.macroPill}>
                                    <Text style={styles.macroPillLabel}>Carbs</Text>
                                    <Text style={styles.macroPillValue}>{netCarbs}</Text>
                                  </View>
                                ) : null}
                                {fiber ? (
                                  <View style={styles.macroPill}>
                                    <Text style={styles.macroPillLabel}>Fiber</Text>
                                    <Text style={styles.macroPillValue}>{fiber}</Text>
                                  </View>
                                ) : null}
                                {protein ? (
                                  <View style={styles.macroPill}>
                                    <Text style={styles.macroPillLabel}>Protein</Text>
                                    <Text style={styles.macroPillValue}>{protein}</Text>
                                  </View>
                                ) : null}
                              </View>
                            ) : null}

                            {typeof opt?.reason === 'string' && opt.reason.trim() ? (
                              <Text style={styles.swapCardReason}>{opt.reason.trim()}</Text>
                            ) : null}

                            {typeof opt?.portion_suggestion === 'string' && opt.portion_suggestion.trim() ? (
                              <Text style={styles.swapCardTip}>Portion: {opt.portion_suggestion.trim()}</Text>
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
                      <Text style={styles.disclaimerSmall}>Glycemic index and macros are estimates; portion size and preparation can change impact.</Text>
                    </View>
                  ) : (
                    <View style={styles.rows}>
                      {aiResult.swaps.better_options.map((item) => (
                        <View key={item} style={styles.row}>
                          <View style={styles.rowIcon}>
                            <Ionicons name="swap-horizontal-outline" size={16} color={Colors.secondary} />
                          </View>
                          <Text style={styles.rowText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {aiResult.swaps?.why_these_are_better ? (
                    <View style={styles.noteCard}>
                      <Text style={styles.noteTitle}>Why these are better</Text>
                      <Text style={styles.noteText}>{aiResult.swaps.why_these_are_better}</Text>
                    </View>
                  ) : null}
                  {aiResult.swaps?.portion_tip ? (
                    <View style={styles.noteCard}>
                      <Text style={styles.noteTitle}>Portion tip</Text>
                      <Text style={styles.noteText}>{aiResult.swaps.portion_tip}</Text>
                    </View>
                  ) : null}
                </>
              ) : null}
            </>
          ) : matches && !aiError ? (
            <>
              <Text style={styles.cardSub}>
                Swaps for <Text style={styles.bold}>{matches.key}</Text>
              </Text>
              <View style={styles.rows}>
                  {matches.items.map((item) => (
                  <View key={item} style={styles.row}>
                    <View style={styles.rowIcon}>
                      <Ionicons name="swap-horizontal-outline" size={16} color={Colors.secondary} />
                    </View>
                    <Text style={styles.rowText}>{item}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.disclaimer}>These are general suggestions. Portion size and your body's response matter.</Text>
            </>
          ) : (
            <>
              <Text style={styles.cardSub}>{aiError ? aiError : 'No swaps found yet for that term.'}</Text>
              {aiErrorCode === 'needs_clarification' && aiSuggestedQuery ? (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setQuery(aiSuggestedQuery)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryButtonText}>Search for “{aiSuggestedQuery}”</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.secondary} />
                </TouchableOpacity>
              ) : null}

              {aiErrorCode === 'invalid_food_input' ||
              aiErrorCode === 'not_food_or_drink' ||
              aiErrorCode === 'needs_clarification' ? (
                <Text style={styles.disclaimer}>Try a general food or drink (e.g. “bread”, “donut”, “soda”).</Text>
              ) : aiErrorCode === 'network_error' ? (
                <Text style={styles.disclaimer}>Make sure your phone is online and the server is reachable.</Text>
              ) : (
                <Text style={styles.disclaimer}>Please try again in a moment.</Text>
              )}
              {shouldUpgrade ? (
                <TouchableOpacity
                  style={styles.upgradeButton}
                  onPress={() =>
                    navigation
                      .getParent()
                      ?.navigate('Profile', { screen: 'ProfileMain', params: { openPremium: true } })
                  }
                  activeOpacity={0.85}
                >
                  <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
                  <Ionicons name="chevron-forward" size={16} color="white" />
                </TouchableOpacity>
              ) : null}
            </>
          )}
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
    justifyContent: 'space-between',
  },
  swapCards: {
    marginTop: 10,
  },
  swapCard: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  swapCardAccent: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: Colors.secondary,
    opacity: 0.9,
  },
  swapCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  swapCardTitle: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '900',
    color: Colors.text,
  },
  impactPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  impactPillText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: Colors.secondary,
  },
  metaRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  metaPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textLight,
  },
  macroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: `${Colors.secondary}10`,
    borderWidth: 1,
    borderColor: `${Colors.secondary}18`,
  },
  macroPillLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: Colors.secondary,
  },
  macroPillValue: {
    fontSize: 11,
    fontWeight: '900',
    color: Colors.text,
  },
  swapCardReason: {
    marginTop: 10,
    fontSize: 13.5,
    color: Colors.text,
    lineHeight: 19,
  },
  swapCardTip: {
    marginTop: 8,
    fontSize: 12.5,
    color: Colors.textLight,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(16, 185, 129, 0.10)',
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(16, 185, 129, 1)',
  },
  disclaimerSmall: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.textLight,
    lineHeight: 16,
  },
  backButton: {
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
  headerRight: { width: 44, height: 44 },
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
  hero: {
    marginTop: 18,
    marginHorizontal: 20,
    padding: 14,
    borderRadius: 18,
    backgroundColor: `${Colors.secondary}10`,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: `${Colors.secondary}18`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1 },
  heroTitle: { fontSize: 15, fontWeight: '900', color: Colors.text },
  heroSub: { marginTop: 6, fontSize: 13, lineHeight: 18, color: Colors.textLight, fontWeight: '600' },
  searchWrap: {
    marginTop: 10,
    marginHorizontal: 20,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 54,
  },
  searchWrapFocused: {
    borderColor: `${Colors.secondary}66`,
    backgroundColor: `${Colors.secondary}08`,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    fontWeight: '600',
    paddingVertical: 0,
  },
  clearButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${Colors.border}55`,
  },
  card: {
    marginTop: 14,
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'relative',
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 14,
    bottom: 14,
    width: 4,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: Colors.secondary,
    opacity: 0.9,
  },
  cardTitle: { fontSize: 18, fontWeight: '900', color: Colors.text },
  cardSub: { marginTop: 6, fontSize: 13, color: Colors.textLight, fontWeight: '700' },
  bold: { color: Colors.text, fontWeight: '900' },
  rows: { marginTop: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: `${Colors.secondary}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, fontSize: 14, color: Colors.text, fontWeight: '800' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 10 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: `${Colors.secondary}12`,
    borderWidth: 1,
    borderColor: `${Colors.secondary}24`,
  },
  pillText: { color: Colors.secondary, fontWeight: '900', fontSize: 12 },
  disclaimer: { marginTop: 14, fontSize: 12, lineHeight: 18, color: Colors.textLight, fontWeight: '600' },
  loadingBox: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: { fontSize: 13, color: Colors.textLight, fontWeight: '700' },
  noteCard: {
    marginTop: 12,
    backgroundColor: `${Colors.secondary}08`,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: `${Colors.secondary}18`,
  },
  noteTitle: { fontSize: 12, fontWeight: '900', color: Colors.text, marginBottom: 6 },
  noteText: { fontSize: 13, lineHeight: 18, color: Colors.textLight, fontWeight: '700' },
  bulletText: { marginTop: 6, fontSize: 13, lineHeight: 18, color: Colors.textLight, fontWeight: '700' },
  secondaryButton: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: `${Colors.secondary}24`,
    backgroundColor: `${Colors.secondary}10`,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secondaryButtonText: { fontSize: 14, fontWeight: '900', color: Colors.secondary },
  upgradeButton: {
    marginTop: 12,
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
