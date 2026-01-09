import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';

export default function RecipeDetailScreen({ navigation, route }) {
  const recipeId = route.params?.id || 'No ID';
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recipe Detail Screen</Text>
      <Text>Recipe ID: {recipeId}</Text>
      <Button title="Go Back" onPress={() => navigation.goBack()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
  },
});