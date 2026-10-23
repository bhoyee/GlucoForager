// screens/main/RecentRecipesScreen.js
// Recipes the user generated: the latest batch ("Recent") or everything ("History"), grouped by day.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, Image } from 'react-native';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../context/authContext';
import { getRecipeImageSettings } from '../../utils/recipeImageSettings';
import { getCachedRecipeImageUrl, isDurableRecipeImageUrl, setCachedRecipeImageUrl } from '../../utils/recipeImageCache';

const CARB_BANDS = [
  { max: 30, label: 'Low carb', color: '#2C8632', bg: '#E9F6EA' },
  { max: 45, label: 'Moderate carb', color: '#B7791F', bg: '#FFF4DE' },
  { max: Infinity, label: 'Higher carb', color: '#C53030', bg: '#FDECEC' },
];

const SOURCE = {
  vision: { label: 'Fridge scan', icon: 'camera' },
  text: { label: 'Typed', icon: 'create' },
};

const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v ?? '').match(/[-+]?\d*\.?\d+/);
  return m ? Number(m[0]) : null;
};

const nutritionOf = (r) => r?.nutritional_info || r?.nutrition || r?.nutrition_per_serving || {};

const minutesOf = (r) => {
  const prep = num(r?.prep_time_minutes ?? r?.prep_time);
  const cook = num(r?.cook_time_minutes ?? r?.cook_time);
  const sum = (prep || 0) + (cook || 0);
  return sum || num(r?.total_time ?? r?.time) || null;
};

const dayGroup = (iso) => {
  if (!iso) return 'Your latest recipes';
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return 'Earlier';
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((start - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'Earlier this week';
  if (diffDays < 31) return 'Earlier this month';
  return 'Older';
};

const RecipeRow = React.memo(function RecipeRow({ recipe, showImage, onPress }) {
  const title = recipe?.name || recipe?.title || 'Recipe';
  const n = nutritionOf(recipe);
  const carbs = num(n?.carbs);
  const protein = num(n?.protein);
  const minutes = minutesOf(recipe);
  const band = carbs != null ? CARB_BANDS.find((b) => carbs <= b.max) : null;
  const source = SOURCE[recipe?.history_source];
  const feeling = recipe?.last_feeling === 'great' ? '😊 Felt great' : recipe?.last_feeling === 'not_great' ? '😕 Not great' : null;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.photoWrap}>
        {showImage && recipe?.image_url ? (
          <Image source={{ uri: recipe.image_url }} style={styles.photo} resizeMode="cover" />
        ) : (
          <LinearGradient colors={['#E6F2EF', '#CFE6E1']} style={[styles.photo, styles.photoEmpty]}>
            <Ionicons name="restaurant" size={24} color={Colors.primary} />
          </LinearGradient>
        )}
        {band ? (
          <View style={[styles.band, { backgroundColor: band.bg }]}>
            <Text style={[styles.bandText, { color: band.color }]}>{band.label}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        {source || feeling ? (
          <View style={styles.badgeRow}>
            {source ? (
              <View style={styles.sourceBadge}>
                <Ionicons name={source.icon} size={10} color={Colors.primary} />
                <Text style={styles.sourceText}>{source.label}</Text>
              </View>
            ) : null}
            {feeling ? <Text style={styles.feeling}>{feeling}</Text> : null}
          </View>
        ) : null}
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {recipe?.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {recipe.description}
          </Text>
        ) : null}
        <View style={styles.statRow}>
          {minutes ? (
            <View style={styles.stat}>
              <Ionicons name="time-outline" size={12} color={Colors.primary} />
              <Text style={styles.statText}>{minutes} min</Text>
            </View>
          ) : null}
          {carbs != null ? (
            <View style={styles.stat}>
              <Ionicons name="nutrition-outline" size={12} color={Colors.primary} />
              <Text style={styles.statText}>{Math.round(carbs)}g carbs</Text>
            </View>
          ) : null}
          {protein != null ? (
            <View style={styles.stat}>
              <Ionicons name="barbell-outline" size={12} color={Colors.primary} />
              <Text style={styles.statText}>{Math.round(protein)}g protein</Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function RecentRecipesScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const isHistoryMode = route.params?.mode === 'history';
  const initialTotal = Number(route.params?.totalRecipes || 0);
  const initialRecipes = Array.isArray(route.params?.initialRecipes) ? route.params.initialRecipes : [];

  const [recipes, setRecipes] = useState(isHistoryMode ? [] : initialRecipes);
  const [isLoading, setIsLoading] = useState(isHistoryMode || initialRecipes.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(isHistoryMode);
  const [totalRecipes, setTotalRecipes] = useState(initialTotal);
  const [recipeImagesEnabled, setRecipeImagesEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getRecipeImageSettings().then((settings) => {
      if (!cancelled) setRecipeImagesEnabled(Boolean(settings?.enabled));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hydrateRecipeImages = useCallback(async (items) => {
    return Promise.all(
      items.map(async (recipe) => {
        if (!recipe || typeof recipe !== 'object') return recipe;
        const directUrl =
          typeof recipe?.image_url === 'string' && recipe.image_url.trim()
            ? recipe.image_url.trim()
            : typeof recipe?.image === 'string' && recipe.image.trim()
              ? recipe.image.trim()
              : '';
        const imageSource = String(recipe?.image_source || recipe?.imageSource || '').toLowerCase();
        if (directUrl && imageSource !== 'placeholder' && isDurableRecipeImageUrl(directUrl)) {
          await setCachedRecipeImageUrl(recipe, directUrl);
          return { ...recipe, image_url: recipe.image_url || directUrl, image: recipe.image || directUrl };
        }
        const cached = await getCachedRecipeImageUrl(recipe);
        if (!cached) return { ...recipe, image_url: '' };
        return { ...recipe, image_url: cached, image: cached, image_source: recipe.image_source || 'ai' };
      })
    );
  }, []);

  const loadRecipes = useCallback(
    async ({ reset = true, append = false, offsetOverride = 0 } = {}) => {
      try {
        if (append) setIsLoadingMore(true);
        else if (reset && !recipes.length) setIsLoading(true);
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          setRecipes([]);
          setHasMore(false);
          return;
        }
        const offset = append ? offsetOverride : 0;
        const endpoint = isHistoryMode
          ? `${API_URL}${API_ENDPOINTS.RECIPE_HISTORY}?limit=20&offset=${offset}`
          : `${API_URL}${API_ENDPOINTS.RECENT_RECIPES}`;
        const response = await apiFetch(endpoint, { headers: { Authorization: `Bearer ${token}` } }, { onUnauthorized: signOut });
        if (response.status === 401) {
          setRecipes([]);
          setHasMore(false);
          return;
        }
        if (!response.ok) {
          Alert.alert('Error', `Unable to load ${isHistoryMode ? 'recipe history' : 'recent recipes'} right now.`);
          return;
        }
        const data = await response.json();
        const items = Array.isArray(data.items) ? data.items : [];
        const hydrated = await hydrateRecipeImages(items);
        setRecipes((current) => (append ? [...current, ...hydrated] : hydrated));
        if (isHistoryMode) {
          setTotalRecipes(Number(data.total || hydrated.length || 0));
          setNextOffset(Number(data.next_offset || 0));
          setHasMore(Boolean(data.has_more));
        } else {
          setHasMore(false);
          setNextOffset(0);
          setTotalRecipes(hydrated.length);
        }
      } catch (error) {
        Alert.alert('Error', `Unable to load ${isHistoryMode ? 'recipe history' : 'recent recipes'} right now.`);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hydrateRecipeImages, isHistoryMode, signOut]
  );

  useEffect(() => {
    if (isFocused) loadRecipes({ reset: true });
  }, [isFocused, loadRecipes]);

  const sections = useMemo(() => {
    const out = [];
    recipes.forEach((r) => {
      const label = dayGroup(r?.history_created_at);
      const last = out[out.length - 1];
      if (last && last.title === label) last.data.push(r);
      else out.push({ title: label, data: [r] });
    });
    return out;
  }, [recipes]);

  const stats = useMemo(() => {
    const scans = recipes.filter((r) => r?.history_source === 'vision').length;
    const week = recipes.filter((r) => ['Today', 'Yesterday', 'Earlier this week'].includes(dayGroup(r?.history_created_at))).length;
    return { scans, week };
  }, [recipes]);

  const title = isHistoryMode ? 'Recipe history' : 'Recent recipes';
  const count = isHistoryMode ? totalRecipes || recipes.length : recipes.length;

  const header = (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={22} color="white" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>{isHistoryMode ? 'Every recipe you have generated' : 'From your last recipe search'}</Text>
        </View>
      </View>
      {count ? (
        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{count}</Text>
            <Text style={styles.summaryLabel}>{count === 1 ? 'recipe' : 'recipes'}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{stats.scans}</Text>
            <Text style={styles.summaryLabel}>from scans</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{stats.week}</Text>
            <Text style={styles.summaryLabel}>this week</Text>
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      {header}
      <SectionList
        style={{ marginTop: -28 }}
        sections={isLoading ? [] : sections}
        keyExtractor={(item, index) => String(item?.history_key || item?.id || `${item?.title}-${index}`)}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 28 + 8, paddingHorizontal: 16, paddingBottom: Math.max(tabBarHeight - 12, 8) + 20 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadRecipes({ reset: true });
            }}
            colors={[Colors.primary]}
            progressViewOffset={28}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (isHistoryMode && hasMore && !isLoadingMore && !isLoading) loadRecipes({ reset: false, append: true, offsetOverride: nextOffset });
        }}
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderItem={({ item }) => (
          <RecipeRow recipe={item} showImage={recipeImagesEnabled} onPress={() => navigation.navigate('RecipeDetail', { recipe: item, source: 'ai' })} />
        )}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ gap: 12, paddingTop: 8 }}>
              {[0, 1, 2].map((k) => (
                <View key={k} style={[styles.card, { padding: 12 }]}>
                  <View style={[styles.photo, { backgroundColor: '#E8EEEC', borderRadius: 14, width: 96, height: 96 }]} />
                  <View style={{ flex: 1, gap: 8, justifyContent: 'center' }}>
                    <View style={styles.skeletonLine} />
                    <View style={[styles.skeletonLine, { width: '60%' }]} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.empty}>
              <LinearGradient colors={['#E9F6EA', '#CFE6E1']} style={styles.emptyIcon}>
                <Ionicons name="time" size={34} color={Colors.primary} />
              </LinearGradient>
              <Text style={styles.emptyTitle}>{isHistoryMode ? 'No recipe history yet' : 'No recent recipes yet'}</Text>
              <Text style={styles.emptyText}>Scan your fridge or type what you have, and your recipes will be saved here.</Text>
              <TouchableOpacity style={styles.emptyShadow} onPress={() => navigation.navigate('Scan', { screen: 'ScanMain' })} activeOpacity={0.9}>
                <LinearGradient colors={['#23807E', '#0B5A46']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyButton}>
                  <Ionicons name="camera" size={18} color="white" />
                  <Text style={styles.emptyButtonText}>Scan my fridge</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={styles.emptySecondary} onPress={() => navigation.navigate('ManualInput')} activeOpacity={0.85}>
                <Ionicons name="create-outline" size={18} color={Colors.primary} />
                <Text style={styles.emptySecondaryText}>Type ingredients</Text>
              </TouchableOpacity>
            </View>
          )
        }
        ListFooterComponent={
          isLoadingMore ? (
            <ActivityIndicator style={{ marginVertical: 18 }} color={Colors.primary} />
          ) : !isHistoryMode && recipes.length && !isLoading ? (
            <TouchableOpacity style={styles.historyLink} onPress={() => navigation.push('RecentRecipes', { mode: 'history' })} activeOpacity={0.85}>
              <Ionicons name="albums-outline" size={17} color={Colors.primary} />
              <Text style={styles.historyLinkText}>See all your past recipes</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
            </TouchableOpacity>
          ) : null
        }
      />
    </View>
  );
}

const CARD_SHADOW = {
  shadowColor: '#0F2A3A',
  shadowOpacity: 0.07,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    zIndex: 10,
    elevation: 5,
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 21, fontWeight: '900', color: 'white' },
  headerSubtitle: { marginTop: 2, fontSize: 12.5, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  summary: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, paddingVertical: 12, marginTop: 16 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: '900', color: 'white' },
  summaryLabel: { fontSize: 11.5, fontWeight: '700', color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  summaryDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.2)' },
  sectionTitle: { fontSize: 13, fontWeight: '900', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 10, marginBottom: 10, paddingHorizontal: 2 },
  card: { flexDirection: 'row', gap: 12, backgroundColor: 'white', borderRadius: 20, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#EDF0EA', ...CARD_SHADOW },
  photoWrap: { width: 104, height: 104, borderRadius: 16, overflow: 'hidden', backgroundColor: '#E6F2EF' },
  photo: { width: 104, height: 104 },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  band: { position: 'absolute', left: 6, bottom: 6, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  bandText: { fontSize: 10, fontWeight: '900' },
  cardBody: { flex: 1, justifyContent: 'center', gap: 4, paddingVertical: 2, paddingRight: 4 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sourceBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8F4F3', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  sourceText: { fontSize: 10.5, fontWeight: '900', color: Colors.primary },
  feeling: { fontSize: 11, fontWeight: '800', color: Colors.textLight },
  title: { fontSize: 15.5, fontWeight: '900', color: Colors.brandNavy, lineHeight: 20 },
  description: { fontSize: 12.5, color: Colors.textLight, lineHeight: 17 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F2F7F6', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  statText: { fontSize: 11.5, fontWeight: '800', color: Colors.brandNavy },
  skeletonLine: { height: 11, borderRadius: 6, backgroundColor: '#E8EEEC', width: '85%' },
  empty: { alignItems: 'center', paddingTop: 36, paddingHorizontal: 16 },
  emptyIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 19, fontWeight: '900', color: Colors.brandNavy, marginTop: 16 },
  emptyText: { fontSize: 13.5, lineHeight: 20, color: Colors.textLight, textAlign: 'center', marginTop: 6 },
  emptyShadow: { marginTop: 20, alignSelf: 'stretch', borderRadius: 16, shadowColor: '#0B5A46', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  emptyButton: { height: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyButtonText: { color: 'white', fontSize: 15.5, fontWeight: '900' },
  emptySecondary: { marginTop: 10, alignSelf: 'stretch', height: 50, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#E8F4F3', borderWidth: 1.5, borderColor: '#CDE7E4' },
  emptySecondaryText: { color: Colors.primary, fontSize: 15, fontWeight: '900' },
  historyLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  historyLinkText: { fontSize: 14, fontWeight: '900', color: Colors.primary },
});
