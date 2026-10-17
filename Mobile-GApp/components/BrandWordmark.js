import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Colors } from '../constants/Colors';

// Two-tone "GlucoForager" wordmark matching the brand artwork: teal "Gluco", navy "Forager".
// Uses the readable brand teal (Colors.primary) rather than the lighter logo teal.
export default function BrandWordmark({ size = 32, style }) {
  return (
    <Text style={[styles.base, { fontSize: size, lineHeight: Math.round(size * 1.2) }, style]} accessibilityRole="header">
      <Text style={styles.gluco}>Gluco</Text>
      <Text style={styles.forager}>Forager</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  gluco: {
    color: Colors.primary,
  },
  forager: {
    color: Colors.brandNavy,
  },
});
