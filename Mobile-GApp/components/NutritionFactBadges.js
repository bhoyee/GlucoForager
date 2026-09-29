// components/NutritionFactBadges.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

// Distinct color per fact (instead of one grey sentence) so the numbers that matter
// most for a diabetes-friendly read - carbs first - are scannable at a glance rather
// than requiring the user to actually read the text to tell them apart.
const FACTS = [
  { key: 'carbs_g', label: 'Carbs', unit: 'g', icon: 'nutrition-outline', color: Colors.primary },
  { key: 'sugars_g', label: 'Sugar', unit: 'g', icon: 'water-outline', color: Colors.accent },
  { key: 'calories', label: 'Calories', unit: '', icon: 'flame-outline', color: Colors.secondary },
];

export default function NutritionFactBadges({ carbsG, netCarbsG, sugarsG, calories, basis, estimated }) {
  const values = { carbs_g: carbsG, sugars_g: sugarsG, calories };
  const items = FACTS.filter((f) => values[f.key] != null);
  if (items.length === 0) return null;

  const prefix = estimated ? '~' : '';
  const basisLabel = basis === 'per_100g' ? 'Per 100g' : basis === 'serving' ? 'Per serving' : null;

  return (
    <View style={styles.wrap}>
      {items.map((f) => (
        <View key={f.key} style={[styles.badge, { backgroundColor: `${f.color}14`, borderColor: `${f.color}30` }]}>
          <Ionicons name={f.icon} size={13} color={f.color} />
          <Text style={[styles.value, { color: f.color }]}>
            {prefix}
            {values[f.key]}
            {f.unit}
            {f.key === 'carbs_g' && netCarbsG != null ? ` (${netCarbsG}g net)` : ''}
          </Text>
          <Text style={[styles.label, { color: f.color }]}>{f.label}</Text>
        </View>
      ))}
      {basisLabel ? <Text style={styles.basisNote}>{basisLabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  value: { fontSize: 13, fontWeight: '900' },
  label: { fontSize: 10, fontWeight: '700', opacity: 0.8, textTransform: 'uppercase', letterSpacing: 0.3 },
  basisNote: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
});
