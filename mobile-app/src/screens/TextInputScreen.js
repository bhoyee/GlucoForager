import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import Header from '../components/common/Header';
import IngredientInput from '../components/inputs/IngredientInput';
import Button from '../components/common/Button';
import { globalStyles, colors } from '../styles/global';
import { searchRecipes } from '../services/api';
import { checkDailyLimit } from '../utils/daily_limit';
import { useSubscription } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';

const TextInputScreen = ({ navigation }) => {
  const [ingredients, setIngredients] = useState([]);
  const { tier, scansToday, incrementScan } = useSubscription();
  const { token } = useAuth();

  const addIngredient = (item) => setIngredients((prev) => [...prev, item]);

  const handleSearch = async () => {
    const limit = checkDailyLimit(tier, scansToday);
    if (!limit.canScan) {
      Alert.alert('Limit reached', 'Daily limit reached (3 scans). Upgrade for unlimited.');
      return;
    }
    try {
      const res = await searchRecipes(ingredients, token);
      incrementScan();
      navigation.navigate('Results', { results: res.results ?? [] });
    } catch (e) {
      Alert.alert('Error', 'Could not generate recipes.');
    }
  };

  return (
    <View style={globalStyles.screen}>
      <Header title="Type ingredients" />
      <Text style={globalStyles.subheading}>Use AI to create recipes from typed ingredients.</Text>
      <IngredientInput onAdd={addIngredient} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
        {ingredients.map((item, idx) => (
          <View
            key={`${item}-${idx}`}
            style={{
              backgroundColor: colors.surface,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: colors.text }}>{item}</Text>
          </View>
        ))}
      </View>
      <Button label="Generate recipes" onPress={handleSearch} />
    </View>
  );
};

export default TextInputScreen;
