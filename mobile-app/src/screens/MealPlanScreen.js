import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, Alert } from 'react-native';
import Header from '../components/common/Header';
import Button from '../components/common/Button';
import { globalStyles, colors } from '../styles/global';
import { createMealPlan, fetchMealPlans } from '../services/api';
import { useAuth } from '../context/AuthContext';

const MealPlanScreen = () => {
  const { token } = useAuth();
  const [plans, setPlans] = useState([]);
  const [date, setDate] = useState('');
  const [recipes, setRecipes] = useState('');

  const load = async () => {
    if (!token) return;
    const res = await fetchMealPlans(token);
    if (res.items) setPlans(res.items);
  };

  useEffect(() => {
    load();
  }, [token]);

  const handleCreate = async () => {
    if (!token) return;
    try {
      await createMealPlan(date || new Date().toISOString().slice(0, 10), [{ title: recipes }], token);
      Alert.alert('Created', 'Meal plan saved');
      setRecipes('');
      load();
    } catch (e) {
      Alert.alert('Error', 'Could not create meal plan');
    }
  };

  return (
    <View style={globalStyles.screen}>
      <Header title="Meal plans" />
      <Text style={globalStyles.subheading}>Premium: save AI recipes into daily plans.</Text>
      <TextInput
        value={date}
        onChangeText={setDate}
        placeholder="Date (YYYY-MM-DD)"
        placeholderTextColor={colors.muted}
        style={{ backgroundColor: colors.surface, color: colors.text, padding: 10, borderRadius: 10, marginBottom: 8 }}
      />
      <TextInput
        value={recipes}
        onChangeText={setRecipes}
        placeholder="Recipe titles (comma separated)"
        placeholderTextColor={colors.muted}
        style={{ backgroundColor: colors.surface, color: colors.text, padding: 10, borderRadius: 10, marginBottom: 8 }}
      />
      <Button label="Save meal plan" onPress={handleCreate} />
      <FlatList
        data={plans}
        keyExtractor={(item) => `${item.id}`}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: colors.surface, padding: 12, borderRadius: 12, marginTop: 8 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{item.plan_date}</Text>
            <Text style={{ color: colors.muted }}>{JSON.stringify(item.recipes)}</Text>
          </View>
        )}
      />
    </View>
  );
};

export default MealPlanScreen;
