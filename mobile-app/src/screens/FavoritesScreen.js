import React from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import Header from '../components/common/Header';
import { globalStyles, colors } from '../styles/global';
import { useFavorites } from '../context/FavoritesContext';
import { useSubscription } from '../context/SubscriptionContext';

const FavoritesScreen = () => {
  const { favorites, removeFavorite } = useFavorites();
  const { isPremium } = useSubscription();

  return (
    <View style={globalStyles.screen}>
      <Header title="Favorites" />
      <Text style={globalStyles.subheading}>
        {isPremium ? 'Your saved AI recipes.' : 'Upgrade to save favorites.'}
      </Text>
      {!favorites.length ? (
        <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.surface }}>
          <Text style={{ color: colors.muted }}>No favorites yet.</Text>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.title}
          renderItem={({ item }) => (
            <View
              style={{
                padding: 12,
                borderRadius: 12,
                backgroundColor: colors.surface,
                marginBottom: 8,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>{item.title}</Text>
              <Text style={{ color: colors.muted }}>{item.description}</Text>
              <TouchableOpacity onPress={() => removeFavorite(item.title)} style={{ marginTop: 6 }}>
                <Text style={{ color: colors.accent }}>Remove</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
};

export default FavoritesScreen;
