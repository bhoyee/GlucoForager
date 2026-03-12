import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';

const LAST_INGREDIENTS_KEY = 'last_used_ingredients_v1';

export default function EatNowScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);

  const cards = useMemo(
    () => [
      {
        key: 'have',
        title: 'Use ingredients I have',
        subtitle: 'Generate 3 ideas from your last ingredients.',
        icon: 'leaf-outline',
        action: async () => {
          try {
            const raw = await AsyncStorage.getItem(LAST_INGREDIENTS_KEY);
            const list = raw ? JSON.parse(raw) : null;
            const ingredients = Array.isArray(list) ? list.filter(Boolean) : [];
            if (!ingredients.length) {
              Alert.alert(
                'No saved ingredients',
                'Scan or type ingredients once, then you can reuse them here.'
              );
              navigation.navigate('ManualInput');
              return;
            }
            navigation.navigate('ManualInput', {
              prefillIngredients: ingredients,
              autoSubmit: true,
              source: 'eat_now_have',
              excludeRecent: true,
              varietyMode: true,
            });
          } catch {
            navigation.navigate('ManualInput');
          }
        },
      },
      {
        key: 'surprise',
        title: 'Surprise me',
        subtitle: 'No input needed - just 3 diabetes-friendly meals.',
        icon: 'sparkles-outline',
        action: async () => {
          navigation.navigate('ManualInput', {
            autoSubmit: true,
            mode: 'surprise',
            source: 'eat_now_surprise',
          });
        },
      },
      {
        key: 'quick',
        title: 'Low-carb quick meal',
        subtitle: 'Under 20 minutes (best effort).',
        icon: 'flash-outline',
        action: async () => {
          navigation.navigate('ManualInput', {
            autoSubmit: true,
            mode: 'quick',
            source: 'eat_now_quick',
          });
        },
      },
    ],
    [navigation]
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Eat now</Text>
          <Text style={styles.headerSubtitle}>Quick ideas for right now</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.content}>
        {cards.map((card) => (
          <TouchableOpacity
            key={card.key}
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => void card.action()}
          >
            <View style={styles.cardIcon}>
              <Ionicons name={card.icon} size={22} color={Colors.primary} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
          </TouchableOpacity>
        ))}

        <Text style={styles.note}>
          Tip: for best results, scan or type your ingredients first - then "Use ingredients I have" becomes 1-tap.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.text,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.textLight,
    fontWeight: '600',
  },
  headerRight: { width: 44, height: 44 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: `${Colors.primary}14`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardText: { flex: 1 },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  cardSubtitle: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textLight,
    fontWeight: '600',
  },
  note: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.textLight,
  },
});
