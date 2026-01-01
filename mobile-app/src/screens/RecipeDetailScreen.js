import React from 'react';
import { View, Text, Image, ScrollView, Alert } from 'react-native';
import Button from '../components/common/Button';
import { globalStyles, colors } from '../styles/global';
import { useSubscription } from '../context/SubscriptionContext';
import { useFavorites } from '../context/FavoritesContext';

const RecipeDetailScreen = ({ route }) => {
  const recipe = route.params?.recipe || {};
  const { isPremium } = useSubscription();
  const { addFavorite } = useFavorites();
  const ingredients = recipe.ingredients || [];
  const instructions = recipe.instructions || [];
  const detected = recipe.detected_ingredients || [];

  return (
    <ScrollView style={globalStyles.screen}>
      <Image
        source={{ uri: recipe.image_url || 'https://via.placeholder.com/600x320.png?text=AI+Recipe' }}
        style={{ width: '100%', height: 220, borderRadius: 12 }}
      />
      <Text style={[globalStyles.heading, { marginTop: 12 }]}>{recipe.title || 'AI Recipe'}</Text>
      <Text style={globalStyles.subheading}>Why This Is Diabetes-Safe</Text>
      <Text style={{ color: colors.text, marginBottom: 12 }}>
        {recipe.why_safe || 'AI optimized for low glycemic impact, higher fiber, and no added sugars.'}
      </Text>

      {detected.length ? (
        <View style={{ backgroundColor: colors.surface, padding: 10, borderRadius: 10, marginBottom: 8 }}>
          <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 4 }}>
            AI detected in your fridge:
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {detected.map((item) => (
              <View
                key={item}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 10,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.primary,
                }}
              >
                <Text style={{ color: colors.text }}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <Text style={globalStyles.heading}>Ingredients</Text>
      {ingredients.map((item, idx) => (
        <View
          key={item.name || idx}
          style={{
            padding: 10,
            borderRadius: 10,
            marginBottom: 6,
            backgroundColor: '#102030',
          }}
        >
          <Text style={{ color: '#6ee7b7', fontWeight: '700' }}>{item.name}</Text>
          <Text style={{ color: colors.muted }}>
            {item.quantity} {item.unit}
          </Text>
        </View>
      ))}

      <Text style={globalStyles.heading}>Instructions</Text>
      {instructions.map((step, idx) => (
        <Text key={`${step}-${idx}`} style={{ color: colors.text, marginBottom: 6 }}>
          {idx + 1}. {step}
        </Text>
      ))}

      <Text style={globalStyles.heading}>Nutrition & Safety</Text>
      <Text style={{ color: colors.muted, marginBottom: 8 }}>
        {recipe.nutritional_info
          ? `Calories: ${recipe.nutritional_info.calories ?? 0} | Carbs: ${recipe.nutritional_info.carbs ?? 0}g`
          : 'Nutrition coming soon'}
      </Text>
      <Text style={{ color: colors.muted, marginBottom: 8 }}>
        AI Model: {recipe.model || 'tier-based'} | GI: {recipe.glycemic_index ?? 'n/a'}
      </Text>

      <Button
        label={isPremium ? 'Save to favorites' : 'Upgrade to save'}
        onPress={() => {
          if (!isPremium) {
            Alert.alert('Premium only', 'Upgrade to save favorites.');
            return;
          }
          addFavorite(recipe);
          Alert.alert('Saved', 'Recipe added to favorites.');
        }}
        disabled={!isPremium}
      />
      {!isPremium && (
        <Text style={{ color: colors.accent, marginTop: 8 }}>
          Premium unlocks favorites, filters, and unlimited scans.
        </Text>
      )}
    </ScrollView>
  );
};

export default RecipeDetailScreen;
