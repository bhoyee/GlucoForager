import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import Header from '../components/common/Header';
import IngredientInput from '../components/inputs/IngredientInput';
import TagInput from '../components/inputs/TagInput';
import Button from '../components/common/Button';
import TierBadge from '../components/common/TierBadge';
import { globalStyles, colors } from '../styles/global';
import { useSubscription } from '../context/SubscriptionContext';

const HomeScreen = ({ navigation }) => {
  const [ingredients, setIngredients] = useState(['chicken breast', 'spinach']);
  const [tags, setTags] = useState(['diabetes-friendly']);
  const { isPremium } = useSubscription();

  const addIngredient = (item) => setIngredients((prev) => [...prev, item]);
  const addTag = (tag) => setTags((prev) => [...prev, tag]);

  const goToCamera = () => navigation.navigate(isPremium ? 'PremiumCamera' : 'FreeCamera');
  const search = () => navigation.navigate('Results', { ingredients, tags });

  return (
    <View style={globalStyles.screen}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TierBadge tier={isPremium ? 'premium' : 'free'} />
        <TouchableOpacity onPress={() => navigation.navigate('Upgrade')}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>{isPremium ? 'Manage' : 'Upgrade'}</Text>
        </TouchableOpacity>
      </View>
      <Header title="What's in your fridge?" />
      <Text style={globalStyles.subheading}>Type or scan your ingredients. We will keep it diabetes-safe.</Text>
      <IngredientInput onAdd={addIngredient} />
      <TagInput onAdd={addTag} />

      <FlatList
        data={ingredients}
        keyExtractor={(item, idx) => `${item}-${idx}`}
        horizontal
        style={{ marginVertical: 10 }}
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: colors.surface,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 12,
              marginRight: 8,
            }}
          >
            <Text style={{ color: colors.text }}>{item}</Text>
          </View>
        )}
      />

      <Button label="Find diabetes-friendly recipes" onPress={search} />

      <TouchableOpacity
        onPress={goToCamera}
        disabled={!isPremium}
        style={{
          backgroundColor: isPremium ? colors.accent : colors.muted,
          padding: 14,
          borderRadius: 12,
          alignItems: 'center',
          marginTop: 8,
        }}
      >
        <Text style={{ color: '#0C1824', fontWeight: '700' }}>
          {isPremium ? 'Use camera recognition' : 'Upgrade for camera access'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default HomeScreen;
