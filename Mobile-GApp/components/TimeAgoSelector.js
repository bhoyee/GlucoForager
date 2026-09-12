// components/TimeAgoSelector.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/Colors';

// Deliberately a "how long ago" chip picker rather than a native date/time picker -
// no @react-native-community/datetimepicker dependency needed (keeps this an
// OTA-shippable JS-only change), and for backdating a log entry a coarse offset is
// both simpler to use and precise enough for the spike-detection window it feeds.
export const TIME_AGO_OPTIONS = [
  { label: 'Just now', minutesAgo: 0 },
  { label: '30 min ago', minutesAgo: 30 },
  { label: '1 hour ago', minutesAgo: 60 },
  { label: '2 hours ago', minutesAgo: 120 },
  { label: '3+ hours ago', minutesAgo: 180 },
];

export function loggedAtFromMinutesAgo(minutesAgo) {
  if (!minutesAgo) return undefined;
  return new Date(Date.now() - minutesAgo * 60000).toISOString();
}

export default function TimeAgoSelector({ value, onChange }) {
  return (
    <View style={styles.row}>
      {TIME_AGO_OPTIONS.map((opt) => {
        const selected = value === opt.minutesAgo;
        return (
          <TouchableOpacity
            key={opt.label}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => onChange(opt.minutesAgo)}
            activeOpacity={0.85}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12.5, fontWeight: '800', color: Colors.textLight },
  chipTextSelected: { color: 'white' },
});
