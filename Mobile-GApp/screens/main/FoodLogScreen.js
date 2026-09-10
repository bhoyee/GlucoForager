import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator, Alert, Modal, ScrollView } from 'react-native';
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
const MGDL_PER_MMOL = 18.0182;

function formatGlucoseValue(valueMgDl) {
  const mmol = (valueMgDl / MGDL_PER_MMOL).toFixed(1);
  return `${valueMgDl} mg/dL · ${mmol} mmol/L`;
}

const FILTERS = [
  { key: 'all', label: 'All', icon: 'apps-outline' },
  { key: 'meal', label: 'Meals', icon: 'restaurant-outline' },
  { key: 'glucose', label: 'Glucose', icon: 'water-outline' },
];

export default function FoodLogScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);

  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [selectedEntry, setSelectedEntry] = useState(null);

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

  const filteredEntries = useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => e.kind === filter)),
    [entries, filter]
  );

  const entryLabel = (item) =>
    item.kind === 'meal' ? item.description : `${formatGlucoseValue(item.value_mg_dl)} reading`;

  const handleDelete = (item) => {
    Alert.alert('Delete entry', `Remove "${entryLabel(item)}"? This can't be undone.`, [
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
            setSelectedEntry((prev) => (prev?.key === item.key ? null : prev));
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
      <TouchableOpacity style={styles.row} onPress={() => setSelectedEntry(item)} activeOpacity={0.75}>
        <View style={[styles.icon, { backgroundColor: isMeal ? `${Colors.primary}14` : `${Colors.accent}14` }]}>
          <Ionicons
            name={isMeal ? 'restaurant-outline' : 'water-outline'}
            size={18}
            color={isMeal ? Colors.primary : Colors.accent}
          />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {isMeal ? item.description : formatGlucoseValue(item.value_mg_dl)}
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
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </TouchableOpacity>
    );
  };

  const detailIsMeal = selectedEntry?.kind === 'meal';
  const detailIsSpike = selectedEntry
    ? detailIsMeal
      ? selectedEntry.flagged_spike_mg_dl != null
      : selectedEntry.is_spike
    : false;

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

        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.85}
              >
                <Ionicons name={f.icon} size={14} color={active ? Colors.primaryDark : 'rgba(255,255,255,0.8)'} />
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : filteredEntries.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="clipboard-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyText}>
            {entries.length === 0
              ? 'No entries yet. Log a meal or glucose reading to see it here.'
              : `No ${filter === 'meal' ? 'meals' : 'glucose readings'} in the last 14 days.`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}
        />
      )}

      <Modal visible={Boolean(selectedEntry)} transparent animationType="fade" onRequestClose={() => setSelectedEntry(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
            {selectedEntry ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeaderRow}>
                  <View
                    style={[
                      styles.icon,
                      { backgroundColor: detailIsMeal ? `${Colors.primary}14` : `${Colors.accent}14` },
                    ]}
                  >
                    <Ionicons
                      name={detailIsMeal ? 'restaurant-outline' : 'water-outline'}
                      size={20}
                      color={detailIsMeal ? Colors.primary : Colors.accent}
                    />
                  </View>
                  <TouchableOpacity style={styles.modalCloseButton} onPress={() => setSelectedEntry(null)} hitSlop={8}>
                    <Ionicons name="close" size={22} color={Colors.textLight} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalTitle}>
                  {detailIsMeal ? selectedEntry.description : formatGlucoseValue(selectedEntry.value_mg_dl)}
                </Text>
                <Text style={styles.modalTimestamp}>{formatDateTime(selectedEntry.logged_at)}</Text>

                {detailIsSpike ? (
                  <View style={[styles.spikeBadge, { marginTop: 12, alignSelf: 'flex-start' }]}>
                    <Ionicons name="alert-circle" size={12} color={Colors.warning} />
                    <Text style={styles.spikeBadgeText}>
                      {detailIsMeal
                        ? `Followed by a ${selectedEntry.flagged_spike_mg_dl} mg/dL spike within 3 hours`
                        : 'This reading followed a logged meal and was 180 mg/dL (10.0 mmol/L) or higher'}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.modalDivider} />

                {detailIsMeal ? (
                  <>
                    <View style={styles.modalDetailRow}>
                      <Text style={styles.modalDetailLabel}>Logged via</Text>
                      <Text style={styles.modalDetailValue}>
                        {SOURCE_LABEL[selectedEntry.source] || selectedEntry.source || 'Typed'}
                      </Text>
                    </View>
                    {selectedEntry.carbs_g != null ? (
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Carbs</Text>
                        <Text style={styles.modalDetailValue}>{selectedEntry.carbs_g}g</Text>
                      </View>
                    ) : null}
                    {selectedEntry.net_carbs_g != null ? (
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Net carbs</Text>
                        <Text style={styles.modalDetailValue}>{selectedEntry.net_carbs_g}g</Text>
                      </View>
                    ) : null}
                    {selectedEntry.sugars_g != null ? (
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Sugar</Text>
                        <Text style={styles.modalDetailValue}>{selectedEntry.sugars_g}g</Text>
                      </View>
                    ) : null}
                    {selectedEntry.calories != null ? (
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Calories</Text>
                        <Text style={styles.modalDetailValue}>{selectedEntry.calories}</Text>
                      </View>
                    ) : null}
                    {selectedEntry.carbs_g == null ? (
                      <Text style={styles.modalNote}>
                        No nutrition data for this entry - it was typed manually, so it won't count toward your
                        daily carb total.
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <>
                    <View style={styles.modalDetailRow}>
                      <Text style={styles.modalDetailLabel}>mg/dL</Text>
                      <Text style={styles.modalDetailValue}>{selectedEntry.value_mg_dl}</Text>
                    </View>
                    <View style={styles.modalDetailRow}>
                      <Text style={styles.modalDetailLabel}>mmol/L</Text>
                      <Text style={styles.modalDetailValue}>
                        {(selectedEntry.value_mg_dl / MGDL_PER_MMOL).toFixed(1)}
                      </Text>
                    </View>
                    {selectedEntry.note ? (
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Note</Text>
                        <Text style={[styles.modalDetailValue, { flex: 1, textAlign: 'right' }]}>
                          {selectedEntry.note}
                        </Text>
                      </View>
                    ) : null}
                  </>
                )}

                <TouchableOpacity
                  style={styles.modalDeleteButton}
                  onPress={() => selectedEntry && handleDelete(selectedEntry)}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                  <Text style={styles.modalDeleteButtonText}>Delete entry</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
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
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  filterChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  filterChipActive: { backgroundColor: 'white', borderColor: 'white' },
  filterChipText: { fontSize: 12.5, fontWeight: '800', color: 'rgba(255,255,255,0.85)' },
  filterChipTextActive: { color: Colors.primaryDark },
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
  spikeBadgeText: { fontSize: 10.5, fontWeight: '800', color: Colors.warning, flexShrink: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 29, 24, 0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalCloseButton: { padding: 4 },
  modalTitle: { marginTop: 14, fontSize: 19, fontWeight: '900', color: Colors.text, lineHeight: 25 },
  modalTimestamp: { marginTop: 4, fontSize: 12, fontWeight: '700', color: Colors.textLight },
  modalDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 16 },
  modalDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.background,
  },
  modalDetailLabel: { fontSize: 13, fontWeight: '700', color: Colors.textLight },
  modalDetailValue: { fontSize: 14, fontWeight: '800', color: Colors.text },
  modalNote: { marginTop: 10, fontSize: 12, lineHeight: 17, color: Colors.textMuted, fontWeight: '600' },
  modalDeleteButton: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    borderRadius: 14,
    backgroundColor: `${Colors.danger}12`,
  },
  modalDeleteButtonText: { fontSize: 14, fontWeight: '800', color: Colors.danger },
});
