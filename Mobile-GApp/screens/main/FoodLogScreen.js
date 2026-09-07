import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { apiFetch } from '../../utils/api';
import { API_URL } from '../../config/api';

function formatDateTime(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return '';
  }
}

const SOURCE_LABEL = { manual: 'Typed', barcode: 'Barcode', photo: 'Photo' };

export default function FoodLogScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);

  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadEntries = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setEntries([]);
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      const [mealsRes, glucoseRes] = await Promise.all([
        apiFetch(`${API_URL}/api/app/meals`, { method: 'GET', headers }, { timeoutMs: 12000 }),
        apiFetch(`${API_URL}/api/app/glucose`, { method: 'GET', headers }, { timeoutMs: 12000 }),
      ]);
      const meals = mealsRes.ok ? (await mealsRes.json())?.items || [] : [];
      const readings = glucoseRes.ok ? (await glucoseRes.json())?.items || [] : [];

      const merged = [
        ...meals.map((m) => ({ ...m, kind: 'meal', key: `meal-${m.id}` })),
        ...readings.map((r) => ({ ...r, kind: 'glucose', key: `glucose-${r.id}` })),
      ].sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at));

      setEntries(merged);
    } catch {
      // Leave whatever was already loaded - a transient failure here shouldn't wipe the list.
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadEntries({ silent: true });
  };

  const handleDelete = (item) => {
    const label = item.kind === 'meal' ? item.description : `${item.value_mg_dl} mg/dL reading`;
    Alert.alert('Delete entry', `Remove "${label}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await AsyncStorage.getItem('userToken');
            if (!token) return;
            const path = item.kind === 'meal' ? `meals/${item.id}` : `glucose/${item.id}`;
            const response = await apiFetch(
              `${API_URL}/api/app/${path}`,
              { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
              { timeoutMs: 8000 }
            );
            if (!response.ok) {
              Alert.alert('Unable to delete', 'Please try again.');
              return;
            }
            setEntries((prev) => prev.filter((e) => e.key !== item.key));
          } catch {
            Alert.alert('Unable to delete', 'Network request failed. Please check your connection.');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }) => {
    const isMeal = item.kind === 'meal';
    const isSpike = isMeal ? item.flagged_spike_mg_dl != null : item.is_spike;
    return (
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: isMeal ? `${Colors.primary}14` : `${Colors.accent}14` }]}>
          <Ionicons
            name={isMeal ? 'restaurant-outline' : 'water-outline'}
            size={18}
            color={isMeal ? Colors.primary : Colors.accent}
          />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {isMeal ? item.description : `${item.value_mg_dl} mg/dL`}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {formatDateTime(item.logged_at)}
            {isMeal && item.source ? ` • ${SOURCE_LABEL[item.source] || item.source}` : ''}
            {isMeal && item.carbs_g != null ? ` • ${item.carbs_g}g carbs` : ''}
            {!isMeal && item.note ? ` • ${item.note}` : ''}
          </Text>
          {isSpike ? (
            <View style={styles.spikeBadge}>
              <Ionicons name="alert-circle" size={11} color={Colors.warning} />
              <Text style={styles.spikeBadgeText}>
                {isMeal ? `Followed by a ${item.flagged_spike_mg_dl} mg/dL spike` : 'Spike after a logged meal'}
              </Text>
            </View>
          ) : null}
        </View>
        <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item)} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color={Colors.textLight} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.headerPanel, { paddingTop: headerPaddingTop }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Food log</Text>
            <Text style={styles.headerSubtitle}>Last 14 days of meals and readings</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="clipboard-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No entries yet. Log a meal or glucose reading to see it here.</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}
        />
      )}
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
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: { flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: 'white' },
  headerSubtitle: { marginTop: 3, fontSize: 12, color: 'rgba(255,255,255,0.78)', fontWeight: '700' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textLight, fontWeight: '600', textAlign: 'center', lineHeight: 20 },
  listContent: { padding: 20, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  rowMeta: { marginTop: 3, fontSize: 12, color: Colors.textLight, fontWeight: '600' },
  spikeBadge: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: `${Colors.warning}18`,
  },
  spikeBadgeText: { fontSize: 10.5, fontWeight: '800', color: Colors.warning },
  deleteButton: { padding: 4 },
});
