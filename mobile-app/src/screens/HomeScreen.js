import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

  const goToCamera = () => navigation.navigate('FreeCamera'); // free and premium share camera, limits enforced in flow

  const search = async () => {
    const limit = checkDailyLimit(tier, scansToday);
    if (!limit.canScan) {
      Alert.alert('Limit reached', 'Daily limit reached (3 scans). Upgrade for unlimited.');
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

  return (
    <SafeAreaView style={globalStyles.screen} edges={['top', 'left', 'right']}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TierBadge tier={isPremium ? 'premium' : 'free'} />
        <TouchableOpacity onPress={() => navigation.navigate('Upgrade')}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>{isPremium ? 'Manage' : 'Upgrade'}</Text>
        </TouchableOpacity>
      </View>
      <Header title="What's in your fridge?" />
      <Text style={globalStyles.subheading}>Type or scan your ingredients. We will keep it diabetes-safe.</Text>
      <AIScanCounter isPremium={isPremium} scansToday={scansToday} />
      <IngredientInput onAdd={addIngredient} />
      <TagInput onAdd={addTag} />

      <FlatList
        data={ingredients}
        keyExtractor={(item, idx) => `${item}-${idx}`}
        horizontal
        style={{ marginVertical: 6 }}
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: colors.surface,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 12,
              marginRight: 8,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: colors.text, marginRight: 6 }}>{item}</Text>
            <TouchableOpacity onPress={() => removeIngredient(item)}>
              <Text style={{ color: colors.muted, fontWeight: '700' }}>×</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <Button label={loading ? 'Finding recipes...' : 'Find diabetes-friendly recipes'} onPress={search} disabled={loading} />
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} /> : null}

      <TouchableOpacity
        onPress={goToCamera}
        style={{
          backgroundColor: colors.accent,
          padding: 14,
          borderRadius: 12,
          alignItems: 'center',
          marginTop: 8,
        }}
      >
        <Text style={{ color: '#0C1824', fontWeight: '700' }}>
          {isPremium ? 'Use camera recognition (unlimited)' : 'Use camera recognition (free: 3 scans/day)'}
        </Text>
      </TouchableOpacity>

      <View style={{ marginTop: 12 }}>
        <Text style={{ color: colors.muted, marginBottom: 6 }}>Tools</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('History')}
            style={{ backgroundColor: colors.surface, padding: 12, borderRadius: 10, flex: 1, marginRight: 6 }}
          >
            <Text style={{ color: colors.text, fontWeight: '700' }}>History</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Recent AI scans</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('MealPlan')}
            style={{ backgroundColor: colors.surface, padding: 12, borderRadius: 10, flex: 1, marginHorizontal: 6 }}
          >
            <Text style={{ color: colors.text, fontWeight: '700' }}>Meal plans</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Premium</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('ShoppingList')}
            style={{ backgroundColor: colors.surface, padding: 12, borderRadius: 10, flex: 1, marginLeft: 6 }}
          >
            <Text style={{ color: colors.text, fontWeight: '700' }}>Shopping</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Premium</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default HomeScreen;
