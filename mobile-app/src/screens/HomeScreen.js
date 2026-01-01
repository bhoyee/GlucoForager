import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { globalStyles } from '../styles/global';
import { useSubscription } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';
import { searchRecipes } from '../services/api';
import { checkDailyLimit } from '../utils/daily_limit';

const palette = {
  primary: '#FF6B35',
  primaryDim: '#F0A17F',
  secondary: '#2E3192',
  text: '#1A1A1A',
  muted: '#666666',
  border: '#E5E5E5',
  bg: '#FFFFFF',
};

const HomeScreen = ({ navigation }) => {
  const [ingredients, setIngredients] = useState(['chicken breast', 'spinach']);
  const [newIngredient, setNewIngredient] = useState('');
  const { isPremium, scansToday, tier, incrementScan } = useSubscription();
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);

  const addIngredient = (item) => {
    const value = item?.trim();
    if (!value) return;
    setIngredients((prev) => [...prev, value]);
    setNewIngredient('');
  };
  const removeIngredient = (item) => setIngredients((prev) => prev.filter((i) => i !== item));

  const goToCamera = () => navigation.navigate('FreeCamera');

  const search = async () => {
    const limit = checkDailyLimit(tier, scansToday);
    if (!limit.canScan && !isPremium) {
      Alert.alert('Limit reached', 'Daily limit reached (3 scans). Upgrade for unlimited.');
      return;
    }
    setLoading(true);
    try {
      const res = await searchRecipes(ingredients, token);
      incrementScan();
      navigation.navigate('Results', { results: res.results ?? [], detected: ingredients, filters: [] });
    } catch (e) {
      Alert.alert('Error', 'Could not generate recipes.');
    } finally {
      setLoading(false);
    }
  };

  const toolbarItemsPremium = ['Tools', 'History', 'Recent AI scans', 'Meal plans', 'Premium', 'Shopping', 'Premium'];
  const toolbarItemsFree = [
    'Tools (Free)',
    'History (Limited)',
    '🔒 Recent AI scans',
    '🔒 Meal plans',
    '🔒 Advanced analytics',
    'Shopping (Basic)',
  ];

  const canScan = isPremium || scansToday < 3;
  const scansLeft = Math.max(0, 3 - scansToday);

  const Chips = () => (
    <View style={styles.chipsWrap}>
      {ingredients.slice(0, 5).map((item) => (
        <View key={item} style={styles.chip}>
          <Text style={styles.chipText}>{item}</Text>
          <TouchableOpacity onPress={() => removeIngredient(item)}>
            <Text style={styles.chipRemove}>×</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );

  const PremiumLayout = () => (
    <>
      <Text style={styles.premiumBadge}>PREMIUM</Text>
      <Text style={styles.title}>What's in your fridge?</Text>
      <Text style={styles.subtitle}>Type or scan your ingredients. We will keep it diabetes-safe.</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Unlimited scans</Text>
        <TextInput
          value={newIngredient}
          onChangeText={setNewIngredient}
          placeholder="Add an ingredient"
          placeholderTextColor="#999"
          style={styles.input}
          onSubmitEditing={() => addIngredient(newIngredient)}
          returnKeyType="done"
        />
        <TouchableOpacity onPress={() => addIngredient(newIngredient)} style={styles.bullet}>
          <Text style={styles.bulletText}>• Add an ingredient</Text>
        </TouchableOpacity>
        <Chips />
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Find diabetes-friendly recipes</Text>
        <TouchableOpacity style={styles.cameraButton} onPress={goToCamera}>
          <Text style={styles.cameraButtonText}>📷 Use camera recognition (unlimited)</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.toolbar}
      >
        {toolbarItemsPremium.map((item) => (
          <TouchableOpacity key={item} style={styles.toolbarItem}>
            <Text style={styles.toolbarText}>{item}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </>
  );

  const FreeLayout = () => (
    <>
      <Text style={styles.title}>What's in your fridge?</Text>
      <Text style={styles.subtitle}>Type or scan your ingredients. We will keep it diabetes-safe.</Text>

      <View style={styles.freeBadge}>
        <Text style={{ fontWeight: '700', color: palette.text }}>🔓 Free Plan</Text>
        <Text style={{ color: palette.secondary, marginTop: 2 }}>⭐ {scansLeft} scans left this week</Text>
      </View>

      <View style={styles.section}>
        <TextInput
          value={newIngredient}
          onChangeText={setNewIngredient}
          placeholder="Add an ingredient"
          placeholderTextColor="#999"
          style={styles.input}
          onSubmitEditing={() => addIngredient(newIngredient)}
          returnKeyType="done"
        />
        <TouchableOpacity onPress={() => addIngredient(newIngredient)} style={styles.bullet}>
          <Text style={styles.bulletText}>• Add an ingredient</Text>
        </TouchableOpacity>
        <Chips />
      </View>

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Find diabetes-friendly recipes</Text>
      <TouchableOpacity
        onPress={canScan ? goToCamera : () => Alert.alert('Limit reached', 'Upgrade for unlimited scans')}
        disabled={!canScan}
        style={[styles.cameraButton, { backgroundColor: canScan ? palette.primary : palette.primaryDim }]}
      >
        <Text style={styles.cameraButtonText}>📷 Use camera recognition</Text>
        <Text style={{ color: '#fff', fontSize: 12 }}>({scansLeft} scans left)</Text>
      </TouchableOpacity>

      <View style={styles.upgradeBox}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: palette.text }}>🔒 Upgrade for unlimited scans</Text>
        <Text style={{ fontSize: 13, color: palette.muted, marginVertical: 6 }}>
          Get AI meal plans, shopping lists, and advanced health insights.
        </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('Upgrade')}
          style={{ backgroundColor: palette.primary, paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}
        >
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>⭐ Upgrade to Premium</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.toolbar}
      >
        {toolbarItemsFree.map((item) => (
          <TouchableOpacity
            key={item}
            onPress={() =>
              item.startsWith('🔒')
                ? Alert.alert('Upgrade required', 'This feature is premium.')
                : navigation.navigate('Tools')
            }
            style={[
              styles.toolbarItem,
              item.startsWith('🔒') && { backgroundColor: '#F8F8F8', borderColor: '#ECECEC' },
            ]}
          >
            <Text style={[styles.toolbarText, item.startsWith('🔒') && { color: '#999' }]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </>
  );

  return (
    <SafeAreaView style={[globalStyles.screen, { backgroundColor: palette.bg }]} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {isPremium ? <PremiumLayout /> : <FreeLayout />}
      </ScrollView>

      <View style={styles.bottomNav}>
        {['Home', 'Favorites', 'Profile'].map((item) => (
          <TouchableOpacity key={item} onPress={() => navigation.navigate(item === 'Home' ? 'Main' : item)}>
            <Text style={{ color: item === 'Home' ? palette.primary : palette.muted, fontWeight: item === 'Home' ? '700' : '500' }}>
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={palette.primary} size="large" />
          <Text style={{ marginTop: 8 }}>Finding recipes...</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  premiumBadge: { textAlign: 'center', letterSpacing: 1, fontSize: 12, color: '#666', marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '700', color: palette.text },
  subtitle: { fontSize: 14, color: palette.muted, marginTop: 4 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: palette.text, marginBottom: 10 },
  bullet: { marginVertical: 6 },
  bulletText: { color: palette.secondary, fontSize: 15 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F7F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: palette.border,
  },
  chipText: { color: palette.text, marginRight: 6 },
  chipRemove: { color: '#999', fontWeight: '700' },
  divider: { height: 1, backgroundColor: palette.border, marginVertical: 16 },
  cameraButton: {
    backgroundColor: palette.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  cameraButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  toolbar: { paddingVertical: 6, gap: 14, paddingRight: 8 },
  toolbarItem: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: palette.border },
  toolbarText: { color: palette.secondary, fontWeight: '600' },
  freeBadge: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: '#FFF9F5',
  },
  upgradeBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFF3EB',
    borderWidth: 1,
    borderColor: '#FFDACC',
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 12,
    fontSize: 15,
    color: palette.text,
    backgroundColor: '#fff',
  },
  bottomNav: {
    height: 64,
    borderTopWidth: 1,
    borderColor: palette.border,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 64,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
});

export default HomeScreen;
