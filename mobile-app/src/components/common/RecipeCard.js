import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../../styles/global';
import { formatNutrition, formatMissingItems } from '../../utils/helpers';

const RecipeCard = ({ recipe, onPress }) => (
  <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.card}>
    <Image
      source={{ uri: recipe.image_url || 'https://via.placeholder.com/400x220.png?text=Diabetes+Friendly' }}
      style={styles.image}
    />
    <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{recipe.title || 'AI Recipe'}</Text>
        <Text style={styles.badge}>Diabetes-Friendly</Text>
      </View>
      <Text style={styles.meta}>Ready in {recipe.total_time ?? 'n/a'} mins</Text>
      <Text style={styles.meta}>{formatNutrition(recipe.nutritional_info)}</Text>
      <Text style={styles.match}>
        Uses {recipe.used_count ?? 0} of your {recipe.total_supplied ?? recipe.total_ingredients ?? 0} items
      </Text>
      <Text style={styles.missing}>{formatMissingItems(recipe.missing_ingredients)}</Text>
    </View>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  image: {
    width: '100%',
    height: 180,
    backgroundColor: colors.background,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  badge: {
    backgroundColor: colors.primary,
    color: '#0C1824',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    fontWeight: '700',
    fontSize: 12,
  },
  meta: {
    color: colors.muted,
    marginBottom: 2,
  },
  match: {
    color: colors.text,
    marginTop: 4,
    fontWeight: '600',
  },
  missing: {
    color: colors.accent,
    marginTop: 2,
  },
});

export default RecipeCard;
