// screens/main/RecipeLibraryScreen.js
// Every recipe in the library (admin recipes + the recipe bank users grow), best match first.
// The user's allergies and diet are always applied on the server; meal and quick filters are optional.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, Image, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { apiFetch } from '../../utils/api';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { useAuth } from '../../context/authContext';

const PAGE = 20;

const mealForNow = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour <= 10) return 'breakfast';
  if (hour >= 11 && hour <= 15) return 'lunch';
  if (hour >= 16 && hour <= 21) return 'dinner';
  return 'snack';
};

const MEALS = [
  { key: 'for_you', label: 'For you', icon: 'sparkles' },
  { key: 'breakfast', label: 'Breakfast', icon: 'sunny' },
  { key: 'lunch', label: 'Lunch', icon: 'restaurant' },
  { key: 'dinner', label: 'Dinner', icon: 'moon' },
  { key: 'snack', label: 'Snack', icon: 'nutrition' },
];

const QUICK = [
  { key: 'under_20', label: 'Under 20 min', icon: 'time-outline' },
  { key: 'low_carb', label: 'Low carb', icon: 'leaf-outline' },
  { key: 'high_protein', label: 'High protein', icon: 'barbell-outline' },
  { key: 'vegetarian', label: 'Vegetarian', icon: 'flower-outline' },
];

const CARB_BANDS = [
  { max: 30, label: 'Low carb', color: '#2C8632', bg: '#E9F6EA' },
  { max: 45, label: 'Moderate carb', color: '#B7791F', bg: '#FFF4DE' },
  { max: Infinity, label: 'Higher carb', color: '#C53030', bg: '#FDECEC' },
];

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const RecipeTile = React.memo(function RecipeTile({ item, onPress, onToggleFavorite, saving }) {
  const carbs = num(item?.nutrition?.carbs);
  const band = carbs != null ? CARB_BANDS.find((b) => carbs <= b.max) : null;
  const minutes = (num(item?.prep_time_minutes) || 0) + (num(item?.cook_time_minutes) || 0);
  const kcal = num(item?.nutrition?.calories);
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.tilePhotoWrap}>
        {item?.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.tilePhoto} resizeMode="cover" />
        ) : (
          <LinearGradient colors={['#E6F2EF', '#CFE6E1']} style={[styles.tilePhoto, styles.tilePhotoEmpty]}>
            <Ionicons name="restaurant" size={26} color={Colors.primary} />
          </LinearGradient>
        )}
        <TouchableOpacity
          style={styles.heart}
          onPress={onToggleFavorite}
          disabled={saving}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={item?.favorite_id ? 'Remove from favourites' : 'Save to favourites'}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#E53E3E" />
          ) : (
            <Ionicons name={item?.favorite_id ? 'heart' : 'heart-outline'} size={17} color={item?.favorite_id ? '#E53E3E' : Colors.brandNavy} />
          )}
        </TouchableOpacity>
        {band ? (
          <View style={[styles.band, { backgroundColor: band.bg }]}>
            <Text style={[styles.bandText, { color: band.color }]}>{band.label}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.tileBody}>
        <Text style={styles.tileTitle} numberOfLines={2}>
          {item?.last_feeling === 'great' ? '😊 ' : ''}
          {item?.name}
        </Text>
        <View style={styles.tileMeta}>
          {minutes ? (
            <Text style={styles.tileMetaText}>
              <Ionicons name="time-outline" size={11} color={Colors.textLight} /> {minutes} min
            </Text>
          ) : null}
          {carbs != null ? <Text style={styles.tileCarbs}>{Math.round(carbs)}g carbs</Text> : null}
          {kcal ? <Text style={styles.tileMetaText}>{Math.round(kcal)} kcal</Text> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function RecipeLibraryScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const [meal, setMeal] = useState(route.params?.meal || 'for_you');
  const [quick, setQuick] = useState([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const requestRef = useRef(0);

  // Debounce typing so we search once the user pauses.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async ({ append = false } = {}) => {
      const requestId = ++requestRef.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) return;
        const params = new URLSearchParams();
        params.set('limit', String(PAGE));
        params.set('offset', String(append ? items.length : 0));
        const mealType = meal === 'for_you' ? mealForNow() : meal;
        // "For you" = what suits now, unless the user is searching everything.
        if (mealType && !(meal === 'for_you' && query)) params.set('meal_type', mealType);
        if (query) params.set('q', query);
        if (quick.length) params.set('quick', quick.join(','));
        const res = await apiFetch(
          `${API_URL}${API_ENDPOINTS.RECIPE_BROWSE}?${params.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } },
          { onUnauthorized: signOut, timeoutMs: 12000 }
        );
        if (requestId !== requestRef.current || !res.ok) return;
        const data = await res.json();
        const next = Array.isArray(data?.items) ? data.items : [];
        setItems((prev) => (append ? [...prev, ...next.filter((n) => !prev.some((p) => p.id === n.id))] : next));
        setTotal(typeof data?.total === 'number' ? data.total : null);
        setHasMore(Boolean(data?.has_more));
      } catch {
        // Keep what's on screen.
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meal, query, quick, signOut, items.length]
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meal, query, quick]);

  const toggleQuick = (key) => setQuick((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const toggleFavorite = async (item) => {
    setSavingId(item.id);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      if (item.favorite_id) {
        const res = await apiFetch(`${API_URL}${API_ENDPOINTS.FAVORITES}/${item.favorite_id}`, { method: 'DELETE', headers }, { onUnauthorized: signOut });
        if (res.ok) setItems((prev) => prev.map((r) => (r.id === item.id ? { ...r, favorite_id: null } : r)));
        return;
      }
      const res = await apiFetch(
        `${API_URL}${API_ENDPOINTS.FAVORITES}`,
        { method: 'POST', headers, body: JSON.stringify({ title: item.name, recipe: { ...item, title: item.name } }) },
        { onUnauthorized: signOut }
      );
      if (!res.ok) {
        Alert.alert('Favourites', 'Unable to save this recipe right now.');
        return;
      }
      // The save doesn't return an id: look it up so a second tap can un-save.
      const list = await apiFetch(`${API_URL}${API_ENDPOINTS.FAVORITES}`, { headers }, { onUnauthorized: signOut });
      const data = list.ok ? await list.json() : null;
      const fav = (data?.items || []).find((f) => String(f.title || '').trim().toLowerCase() === String(item.name || '').trim().toLowerCase());
      setItems((prev) => prev.map((r) => (r.id === item.id ? { ...r, favorite_id: fav?.id || true } : r)));
    } catch {
      Alert.alert('Favourites', 'Network request failed. Please check your connection.');
    } finally {
      setSavingId(null);
    }
  };

  const mealLabel = meal === 'for_you' ? `${mealForNow().replace(/^./, (c) => c.toUpperCase())} ideas` : MEALS.find((m) => m.key === meal)?.label;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Recipes</Text>
            <Text style={styles.headerSubtitle}>
              {total == null ? 'Diabetes-friendly ideas, picked for you' : `${total} ${total === 1 ? 'recipe' : 'recipes'} · safe for your preferences`}
            </Text>
          </View>
        </View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search recipes…"
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={Colors.textLight} />
            </TouchableOpacity>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mealRow}>
          {MEALS.map((m) => {
            const active = meal === m.key;
            return (
              <TouchableOpacity key={m.key} style={[styles.mealChip, active && styles.mealChipActive]} onPress={() => setMeal(m.key)} activeOpacity={0.85}>
                <Ionicons name={m.icon} size={13} color={active ? Colors.primaryDark : 'white'} />
                <Text style={[styles.mealChipText, active && styles.mealChipTextActive]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        style={{ marginTop: -28 }}
        data={items}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={{ paddingTop: 28 + 14, paddingHorizontal: 14, paddingBottom: Math.max(insets.bottom, 12) + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasMore && !loading && !loadingMore) void load({ append: true });
        }}
        ListHeaderComponent={
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
              {QUICK.map((f) => {
                const active = quick.includes(f.key);
                return (
                  <TouchableOpacity key={f.key} style={[styles.quickChip, active && styles.quickChipActive]} onPress={() => toggleQuick(f.key)} activeOpacity={0.85}>
                    <Ionicons name={active ? 'checkmark' : f.icon} size={13} color={active ? 'white' : Colors.primary} />
                    <Text style={[styles.quickChipText, active && { color: 'white' }]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{query ? `Results for "${query}"` : mealLabel}</Text>
              <View style={styles.safePill}>
                <Ionicons name="shield-checkmark" size={12} color="#2C8632" />
                <Text style={styles.safeText}>Allergies applied</Text>
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <RecipeTile
            item={item}
            saving={savingId === item.id}
            onPress={() => navigation.navigate('RecipeDetail', { recipe: item, source: 'admin' })}
            onToggleFavorite={() => void toggleFavorite(item)}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.skeletonGrid}>
              {[0, 1, 2, 3].map((k) => (
                <View key={k} style={[styles.tile, styles.skeletonTile]}>
                  <View style={[styles.tilePhoto, { backgroundColor: '#E8EEEC' }]} />
                  <View style={styles.tileBody}>
                    <View style={styles.skeletonLine} />
                    <View style={[styles.skeletonLine, { width: '55%' }]} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.empty}>
              <LinearGradient colors={['#E9F6EA', '#CFE6E1']} style={styles.emptyIcon}>
                <Ionicons name="search" size={30} color={Colors.primary} />
              </LinearGradient>
              <Text style={styles.emptyTitle}>Nothing matches yet</Text>
              <Text style={styles.emptyText}>Try fewer filters, or make recipes from what you have at home.</Text>
              <TouchableOpacity style={styles.emptyShadow} onPress={() => navigation.navigate('ManualInput')} activeOpacity={0.9}>
                <LinearGradient colors={['#23807E', '#0B5A46']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyButton}>
                  <Ionicons name="sparkles" size={17} color="white" />
                  <Text style={styles.emptyButtonText}>Generate from my ingredients</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 18 }} color={Colors.primary} /> : null}
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
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'white', borderRadius: 16, paddingHorizontal: 14, height: 46, marginTop: 14 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.text, paddingVertical: 0 },
  mealRow: { gap: 8, marginTop: 12, paddingRight: 8 },
  mealChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
  mealChipActive: { backgroundColor: 'white' },
  mealChipText: { color: 'white', fontSize: 13, fontWeight: '800' },
  mealChipTextActive: { color: Colors.primaryDark },
  quickRow: { gap: 8, paddingBottom: 12, paddingRight: 8 },
  quickChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E8F4F3', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#CDE7E4' },
  quickChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  quickChipText: { fontSize: 12.5, fontWeight: '800', color: Colors.primary },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: Colors.brandNavy, textTransform: 'capitalize', flexShrink: 1 },
  safePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E9F6EA', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  safeText: { fontSize: 11, fontWeight: '800', color: '#2C8632' },
  gridRow: { gap: 12, marginBottom: 12 },
  tile: { flex: 1, backgroundColor: 'white', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#EDF0EA', ...CARD_SHADOW },
  tilePhotoWrap: { height: 120, backgroundColor: '#E6F2EF' },
  tilePhoto: { width: '100%', height: 120 },
  tilePhotoEmpty: { alignItems: 'center', justifyContent: 'center' },
  heart: { position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  band: { position: 'absolute', left: 8, bottom: 8, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  bandText: { fontSize: 10.5, fontWeight: '900' },
  tileBody: { padding: 10, gap: 6 },
  tileTitle: { fontSize: 14, fontWeight: '900', color: Colors.brandNavy, lineHeight: 18, minHeight: 36 },
  tileMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  tileMetaText: { fontSize: 11.5, fontWeight: '700', color: Colors.textLight },
  tileCarbs: { fontSize: 11.5, fontWeight: '900', color: Colors.primary },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  skeletonTile: { flexBasis: '47%', flexGrow: 1 },
  skeletonLine: { height: 10, borderRadius: 5, backgroundColor: '#E8EEEC', width: '85%' },
  empty: { alignItems: 'center', paddingTop: 30, paddingHorizontal: 16 },
  emptyIcon: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: Colors.brandNavy, marginTop: 14 },
  emptyText: { fontSize: 13.5, lineHeight: 20, color: Colors.textLight, textAlign: 'center', marginTop: 6 },
  emptyShadow: { marginTop: 18, borderRadius: 16, shadowColor: '#0B5A46', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  emptyButton: { height: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 22 },
  emptyButtonText: { color: 'white', fontSize: 15, fontWeight: '900' },
});
