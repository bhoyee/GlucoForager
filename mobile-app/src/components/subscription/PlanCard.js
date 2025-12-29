import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../../styles/global';

const PlanCard = ({ plan, onSelect, selected }) => (
  <View style={[styles.card, selected && styles.selected]}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={styles.title}>{plan.name}</Text>
      <Text style={styles.price}>{plan.price}</Text>
    </View>
    <Text style={styles.meta}>{plan.features.join(' • ')}</Text>
    <TouchableOpacity onPress={() => onSelect(plan.id)} style={styles.btn}>
      <Text style={{ color: '#0C1824', fontWeight: '700' }}>{selected ? 'Selected' : 'Choose'}</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  selected: {
    borderColor: colors.primary,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  price: {
    color: colors.accent,
    fontWeight: '700',
  },
  meta: {
    color: colors.muted,
    marginVertical: 8,
  },
  btn: {
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
});

export default PlanCard;
