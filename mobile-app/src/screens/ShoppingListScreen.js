import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, Alert } from 'react-native';
import Header from '../components/common/Header';
import Button from '../components/common/Button';
import { globalStyles, colors } from '../styles/global';
import { fetchShoppingList, createShoppingList } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';

const ShoppingListScreen = () => {
  const { token } = useAuth();
  const { isPremium } = useSubscription();
  const [lists, setLists] = useState([]);
  const [title, setTitle] = useState('');
  const [items, setItems] = useState('');

  const load = async () => {
    if (!token) return;
    const res = await fetchShoppingList(token);
    if (res.items) setLists(res.items);
  };

  useEffect(() => {
    load();
  }, [token]);

  const handleCreate = async () => {
    if (!token) return;
    if (!isPremium) {
      Alert.alert('Premium required', 'Upgrade to save shopping lists.');
      return;
    }
    try {
      const payloadItems = items
        .split(',')
        .map((i) => i.trim())
        .filter(Boolean);
      await createShoppingList(title || 'My list', payloadItems, token);
      Alert.alert('Saved', 'Shopping list created.');
      setTitle('');
      setItems('');
      load();
    } catch (e) {
      Alert.alert('Error', 'Could not create shopping list.');
    }
  };

  return (
    <View style={globalStyles.screen}>
      <Header title="Shopping lists" />
      <Text style={globalStyles.subheading}>Save AI-generated shopping items (premium).</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="List title"
        placeholderTextColor={colors.muted}
        style={{ backgroundColor: colors.surface, color: colors.text, padding: 10, borderRadius: 10, marginBottom: 8 }}
      />
      <TextInput
        value={items}
        onChangeText={setItems}
        placeholder="Items (comma separated)"
        placeholderTextColor={colors.muted}
        style={{ backgroundColor: colors.surface, color: colors.text, padding: 10, borderRadius: 10, marginBottom: 8 }}
      />
      <Button label="Save list" onPress={handleCreate} />
      <FlatList
        data={lists}
        keyExtractor={(item) => `${item.id}`}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: colors.surface, padding: 12, borderRadius: 12, marginTop: 8 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{item.title}</Text>
            <Text style={{ color: colors.muted, marginTop: 4 }}>{(item.items || []).join(', ')}</Text>
          </View>
        )}
      />
    </View>
  );
};

export default ShoppingListScreen;
