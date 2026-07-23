// screens/main/WeeklyRecapScreen.js
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../context/authContext';

const FEELING_META = {
  great: { emoji: '🙂', label: 'Great' },
  ok: { emoji: '😐', label: 'OK' },
  not_great: { emoji: '🙁', label: 'Not great' },
};

export default function WeeklyRecapScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom + 12, 12);

  const [recap, setRecap] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadRecap = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setRecap(null);
        return;
      }
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.RECAP_WEEKLY}`,
        { headers: { Authorization: `Bearer ${token}` } },
        { onUnauthorized: signOut }
      );
      if (response.status === 401) {
        setRecap(null);
        return;
      }
      if (!response.ok) {
        Alert.alert('Error', 'Unable to load your weekly recap right now.');
        return;
      }
      const data = await response.json().catch(() => ({}));
      setRecap(data);
    } catch (error) {
      Alert.alert('Error', 'Unable to load your weekly recap right now.');
    } finally {
      setIsLoading(false);
    }
  }, [signOut]);

  useEffect(() => {
    if (isFocused) {
      setIsLoading(true);
      loadRecap();
    }
  }, [isFocused, loadRecap]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading your recap...</Text>
      </View>
    );
  }

  const checkIns = recap?.check_ins || { great: 0, ok: 0, not_great: 0 };
  const totalCheckIns = checkIns.great + checkIns.ok + checkIns.not_great;
  const hasActivity =
    Boolean(recap) &&
    (recap.recipes_generated > 0 ||
      recap.favorites_added > 0 ||
      totalCheckIns > 0 ||
      recap.streak_days > 0);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentBottomPadding }}
      >
        <View style={[styles.headerPanel, { paddingTop: headerPaddingTop }]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={22} color="white" />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Weekly Recap</Text>
              <Text style={styles.headerSubtitle}>Last 7 days</Text>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          {!hasActivity ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="stats-chart-outline" size={90} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>Nothing to show yet</Text>
              <Text style={styles.emptySubtitle}>
                Generate a recipe, save a favorite, or log how a meal made you feel — your
                weekly recap will show up here.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.statsRow}>
                <View style={styles.statTile}>
                  <View style={styles.statIcon}>
                    <Ionicons name="restaurant-outline" size={20} color={Colors.primary} />
                  </View>
                  <Text style={styles.statValue}>{recap.recipes_generated}</Text>
                  <Text style={styles.statLabel}>Recipes made</Text>
                </View>
                <View style={styles.statTile}>
                  <View style={styles.statIcon}>
                    <Ionicons name="bookmark-outline" size={20} color={Colors.primary} />
                  </View>
                  <Text style={styles.statValue}>{recap.favorites_added}</Text>
                  <Text style={styles.statLabel}>Favorited</Text>
                </View>
                <View style={styles.statTile}>
                  <View style={styles.statIcon}>
                    <Ionicons name="flame" size={20} color={Colors.accent} />
                  </View>
                  <Text style={styles.statValue}>{recap.streak_days}</Text>
                  <Text style={styles.statLabel}>Day streak</Text>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>How meals made you feel</Text>
                {totalCheckIns === 0 ? (
                  <Text style={styles.emptyItemsText}>
                    No check-ins yet this week — log one from a recipe's detail screen.
                  </Text>
                ) : (
                  <View style={styles.feelingsCard}>
                    {Object.entries(FEELING_META).map(([key, meta]) => (
                      <View key={key} style={styles.feelingRow}>
                        <Text style={styles.feelingEmoji}>{meta.emoji}</Text>
                        <Text style={styles.feelingLabel}>{meta.label}</Text>
                        <Text style={styles.feelingCount}>{checkIns[key] || 0}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {recap.top_recipe ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Recipe of the week</Text>
                  <View style={styles.topRecipeCard}>
                    <View style={styles.topRecipeIcon}>
                      <Ionicons name="trophy-outline" size={22} color="white" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.topRecipeName} numberOfLines={2}>
                        {recap.top_recipe.name}
                      </Text>
                      <Text style={styles.topRecipeMeta}>
                        Logged "Great" {recap.top_recipe.great_count}{' '}
                        {recap.top_recipe.great_count === 1 ? 'time' : 'times'} this week
                      </Text>
                    </View>
                  </View>
                </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: { marginTop: 12, fontSize: 16, color: Colors.textLight },
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
  headerTitle: { fontSize: 21, fontWeight: '900', color: 'white' },
  headerSubtitle: { marginTop: 2, fontSize: 13, color: 'rgba(255,255,255,0.78)', fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingTop: 18 },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textLight,
    textAlign: 'center',
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: `${Colors.primary}14`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: { fontSize: 20, fontWeight: '900', color: Colors.text },
  statLabel: { marginTop: 2, fontSize: 11, fontWeight: '700', color: Colors.textLight, textAlign: 'center' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  emptyItemsText: { fontSize: 13, color: Colors.textLight, lineHeight: 19 },
  feelingsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 6,
  },
  feelingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  feelingEmoji: { fontSize: 20, marginRight: 10 },
  feelingLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.text },
  feelingCount: { fontSize: 16, fontWeight: '900', color: Colors.primary },
  topRecipeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: `${Colors.accent}12`,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${Colors.accent}40`,
    padding: 14,
  },
  topRecipeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRecipeName: { fontSize: 15, fontWeight: '800', color: Colors.text },
  topRecipeMeta: { marginTop: 3, fontSize: 12, fontWeight: '600', color: Colors.textLight },
});
