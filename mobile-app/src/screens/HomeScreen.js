import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Header from '../components/common/Header';
import IngredientInput from '../components/inputs/IngredientInput';
import TagInput from '../components/inputs/TagInput';
import Button from '../components/common/Button';
import TierBadge from '../components/common/TierBadge';
import AIScanCounter from '../components/common/AIScanCounter';
import { globalStyles, colors } from '../styles/global';
import { useSubscription } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';
import { searchRecipes } from '../services/api';
import { checkDailyLimit } from '../utils/daily_limit';

const HomeScreen = ({ navigation }) => {
  const [ingredients, setIngredients] = useState(['chicken breast', 'spinach']);
  const [tags, setTags] = useState(['diabetes-friendly']);
  const { isPremium, scansToday, tier, incrementScan } = useSubscription();
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);

  const addIngredient = (item) => setIngredients((prev) => [...prev, item]);
  const removeIngredient = (item) => setIngredients((prev) => prev.filter((i) => i !== item));
  const addTag = (tag) => setTags((prev) => [...prev, tag]);

  const goToCamera = () => navigation.navigate('FreeCamera');
  const goToUpgrade = () => navigation.navigate('Profile', { screen: 'Upgrade' });

  const search = async () => {
    const limit = checkDailyLimit(tier, scansToday);
    if (!limit.canScan && !isPremium) {
      Alert.alert('Limit reached', 'You have used your 3 free scans. Upgrade for unlimited access.');
      return;
    }
    setLoading(true);
    try {
      const res = await searchRecipes(ingredients, token);
      incrementScan();
      navigation.navigate('Results', { results: res.results ?? [], detected: ingredients, filters: tags });
    } catch (e) {
      Alert.alert('Error', 'Could not generate recipes.');
    } finally {
      setLoading(false);
    }
  };

  const handleCamera = () => {
    const limit = checkDailyLimit(tier, scansToday);
    if (!limit.canScan && !isPremium) {
      Alert.alert('Limit reached', 'You have used your 3 free scans. Upgrade for unlimited access.', [
        { text: 'Upgrade', onPress: goToUpgrade },
        { text: 'OK' },
      ]);
      return;
    }
    goToCamera();
  };

  const scansLeft = Math.max(0, 3 - scansToday);
  const cameraDisabled = !isPremium && scansLeft === 0;

  return (
    <SafeAreaView style={[globalStyles.screen, styles.safeArea]} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.topRow}>
          <TierBadge tier={isPremium ? 'premium' : 'free'} />
          <TouchableOpacity onPress={goToUpgrade}>
            <Text style={styles.linkText}>{isPremium ? 'Manage plan' : 'Upgrade'}</Text>
          </TouchableOpacity>
        </View>

        <Header title="What's in your fridge?" />
        <Text style={globalStyles.subheading}>Type or scan your ingredients. We keep it diabetes-safe.</Text>

        <AIScanCounter isPremium={isPremium} scansToday={scansToday} />

        <IngredientInput onAdd={addIngredient} />
        <TagInput onAdd={addTag} />

        <View style={styles.chipWrap}>
          {ingredients.map((item) => (
            <View key={item} style={styles.chip}>
              <Text style={styles.chipText}>{item}</Text>
              <TouchableOpacity onPress={() => removeIngredient(item)} accessibilityLabel={`Remove ${item}`}>
                <Ionicons name="close" size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <Button label={loading ? 'Finding recipes...' : 'Find diabetes-friendly recipes'} onPress={search} disabled={loading} />
        {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} /> : null}

        <TouchableOpacity
          onPress={handleCamera}
          disabled={cameraDisabled}
          style={[
            styles.cameraButton,
            {
              backgroundColor: cameraDisabled ? colors.surface : colors.accent,
              opacity: cameraDisabled ? 0.6 : 1,
            },
          ]}
        >
          <Ionicons name="camera" size={18} color="#0C1824" style={{ marginRight: 8 }} />
          <View>
            <Text style={styles.cameraText}>Use camera recognition</Text>
            <Text style={styles.cameraSubtext}>
              {isPremium ? 'Unlimited scans' : `${scansLeft} free scans left today`}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.toolsHeader}>
          <Text style={styles.toolsLabel}>Tools</Text>
          <Text style={styles.toolsHint}>{isPremium ? 'Included in Premium' : 'Upgrade to unlock more'}</Text>
        </View>

        <View style={styles.toolRow}>
          <TouchableOpacity style={styles.toolCard} onPress={() => navigation.navigate('History')}>
            <Ionicons name="time" size={18} color={colors.primary} />
            <Text style={styles.toolTitle}>History</Text>
            <Text style={styles.toolSubtitle}>Recent AI scans</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolCard} onPress={() => navigation.navigate('MealPlan')}>
            <Ionicons name="restaurant" size={18} color={colors.primary} />
            <Text style={styles.toolTitle}>Meal plans</Text>
            <Text style={styles.toolSubtitle}>{isPremium ? 'Custom weekly' : 'Premium'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolCard} onPress={() => navigation.navigate('ShoppingList')}>
            <Ionicons name="cart" size={18} color={colors.primary} />
            <Text style={styles.toolTitle}>Shopping</Text>
            <Text style={styles.toolSubtitle}>{isPremium ? 'Lists saved' : 'Premium'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { paddingBottom: 0 },
  scrollContent: { paddingBottom: 32 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  linkText: { color: colors.accent, fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 6,
  },
  chipText: { color: colors.text, marginRight: 8 },
  cameraButton: {
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cameraText: { color: '#0C1824', fontWeight: '700' },
  cameraSubtext: { color: '#0C1824', fontSize: 12 },
  toolsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  toolsLabel: { color: colors.text, fontWeight: '700' },
  toolsHint: { color: colors.muted, fontSize: 12 },
  toolRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  toolCard: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 12,
    flex: 1,
    marginHorizontal: 4,
  },
  toolTitle: { color: colors.text, fontWeight: '700', marginTop: 6 },
  toolSubtitle: { color: colors.muted, fontSize: 12 },
});

export default HomeScreen;
