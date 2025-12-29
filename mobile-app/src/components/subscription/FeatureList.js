import React from 'react';
import { View, Text } from 'react-native';
import { colors } from '../../styles/global';

const FeatureList = ({ items }) => (
  <View style={{ gap: 6 }}>
    {items.map((item) => (
      <View key={item} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: colors.primary }}>•</Text>
        <Text style={{ color: colors.text }}>{item}</Text>
      </View>
    ))}
  </View>
);

export default FeatureList;
