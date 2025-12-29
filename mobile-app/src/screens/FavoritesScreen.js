import React from 'react';
import { View, Text } from 'react-native';
import Header from '../components/common/Header';
import { globalStyles, colors } from '../styles/global';

const FavoritesScreen = () => (
  <View style={globalStyles.screen}>
    <Header title="Favorites" />
    <Text style={globalStyles.subheading}>Save premium recipes here.</Text>
    <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.surface }}>
      <Text style={{ color: colors.muted }}>No favorites yet. Upgrade to start saving.</Text>
    </View>
  </View>
);

export default FavoritesScreen;
