import React from 'react';
import { View, Text, Image, ScrollView, Alert } from 'react-native';
import Button from '../components/common/Button';
import { globalStyles, colors } from '../styles/global';
import { useSubscription } from '../context/SubscriptionContext';
import { useFavorites } from '../context/FavoritesContext';

const demoRecipe = {
  title: 'Lemon Garlic Salmon',
  image_url: 'https://via.placeholder.com/600x320.png?text=Salmon',
  why_safe: 'Low glycemic load, rich in omega-3 fats, and minimal starches.',
  ingredients: [
    { name: 'salmon', owned: true, quantity: '2 fillets' },
    { name: 'lemon', owned: false, quantity: '1' },
    { name: 'olive oil', owned: false, quantity: '2 tbsp' },
    { name: 'garlic', owned: true, quantity: '2 cloves' },
    { name: 'spinach', owned: true, quantity: '2 cups' },
  ],
  instructions: [
    'Preheat oven to 200°C and line a tray.',
    'Brush salmon with olive oil, garlic, and lemon zest.',
    'Roast for 12-14 minutes until flaky.',
    'Wilt spinach in pan with olive oil, plate with salmon, finish with lemon juice.',
  ],
};

const RecipeDetailScreen = () => {
  const { isPremium } = useSubscription();
  const { addFavorite } = useFavorites();

  return (
    <ScrollView style={globalStyles.screen}>
      <Image source={{ uri: demoRecipe.image_url }} style={{ width: '100%', height: 220, borderRadius: 12 }} />
      <Text style={[globalStyles.heading, { marginTop: 12 }]}>{demoRecipe.title}</Text>
      <Text style={globalStyles.subheading}>Why This Is Diabetes-Safe</Text>
      <Text style={{ color: colors.text, marginBottom: 12 }}>{demoRecipe.why_safe}</Text>

      <Text style={globalStyles.heading}>Ingredients</Text>
      {demoRecipe.ingredients.map((item) => (
        <View
          key={item.name}
          style={{
            padding: 10,
            borderRadius: 10,
            marginBottom: 6,
            backgroundColor: item.owned ? '#0d2a1b' : '#2d1f0f',
          }}
        >
          <Text style={{ color: item.owned ? '#6ee7b7' : '#fb923c', fontWeight: '700' }}>{item.name}</Text>
          <Text style={{ color: colors.muted }}>{item.quantity}</Text>
        </View>
      ))}

      <Text style={globalStyles.heading}>Instructions</Text>
      {demoRecipe.instructions.map((step, idx) => (
        <Text key={step} style={{ color: colors.text, marginBottom: 6 }}>
          {idx + 1}. {step}
        </Text>
      ))}

      <Button
        label="Save to favorites"
        onPress={() => {
          if (!isPremium) {
            Alert.alert('Premium only', 'Upgrade to save favorites.');
            return;
          }
          addFavorite(demoRecipe);
          Alert.alert('Saved', 'Recipe added to favorites.');
        }}
        disabled={!isPremium}
      />
      {!isPremium && (
        <Text style={{ color: colors.accent, marginTop: 8 }}>
          Premium unlocks favorites and camera recognition.
        </Text>
      )}
    </ScrollView>
  );
};

export default RecipeDetailScreen;
