import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { apiFetch } from '../../utils/api';
import { API_ENDPOINTS } from '../../config/api';
import { API_URL } from '../../config/api';
import { useAuth } from '../../context/authContext';

const LAST_INGREDIENTS_KEY = 'last_used_ingredients_v1';

export default function EatNowScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);
  const { signOut } = useAuth();

  const cards = useMemo(
    () => [
      {
        key: 'have',
        title: 'Use ingredients I have',
        subtitle: 'Generate 3 ideas from your last ingredients.',
        icon: 'leaf-outline',
        accent: Colors.primary,
        action: async () => {
          try {
            const raw = await AsyncStorage.getItem(LAST_INGREDIENTS_KEY);
            const list = raw ? JSON.parse(raw) : null;
            const ingredients = Array.isArray(list) ? list.filter(Boolean) : [];
            if (!ingredients.length) {
              // Fallback to server (more reliable in production + after reinstalls).
              try {
                const token = await AsyncStorage.getItem('userToken');
                if (token) {
                  const res = await apiFetch(
                    `${API_URL}${API_ENDPOINTS.USER_LAST_INGREDIENTS}`,
                    { headers: { Authorization: `Bearer ${token}` } },
                    { onUnauthorized: signOut, timeoutMs: 10000 }
                  );
                  if (res.ok) {
                    const data = await res.json();
                    const serverList = Array.isArray(data?.ingredients) ? data.ingredients.filter(Boolean) : [];
                    if (serverList.length) {
                      await AsyncStorage.setItem(LAST_INGREDIENTS_KEY, JSON.stringify(serverList));
                      navigation.navigate('ManualInput', {
                        prefillIngredients: serverList,
                        autoSubmit: true,
                        source: 'eat_now_have',
                        excludeRecent: true,
                        varietyMode: true,
                      });
                      return;
                    }
                  }
                }
              } catch {
                // Ignore.
              }

              Alert.alert('No saved ingredients', 'Scan or type ingredients once, then you can reuse them here.');
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
        icon: 'shuffle-outline',
        accent: Colors.secondary,
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
        accent: Colors.accent,
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
      <View style={[styles.headerPanel, { paddingTop: headerPaddingTop }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Eat Now</Text>
            <Text style={styles.headerSubtitle}>Quick ideas for right now</Text>
          </View>
          <View style={styles.headerRight} />
        </View>
      </View>

      <View style={styles.content}>
        {cards.map((card) => (
          <TouchableOpacity
            key={card.key}
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => void card.action()}
          >
            <View style={[styles.cardAccent, { backgroundColor: card.accent }]} />
            <View style={[styles.cardIcon, { backgroundColor: `${card.accent}14` }]}>
              <Ionicons name={card.icon} size={22} color={card.accent} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
          </TouchableOpacity>
        ))}

        <View style={styles.noteBox}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.secondary} />
          <Text style={styles.noteText}>
            <Text style={styles.noteLabel}>Tip:</Text> for best results, scan or type your ingredients first - then "Use
            ingredients I have" becomes 1-tap.
          </Text>
        </View>
      </View>
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
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: 'white',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '600',
  },
  headerRight: { width: 44, height: 44 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 4,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    opacity: 0.9,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
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
  noteBox: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: `${Colors.secondary}14`,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.text,
  },
  noteLabel: {
    color: Colors.secondary,
    fontWeight: '900',
  },
});
