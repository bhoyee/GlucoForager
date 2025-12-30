import React from 'react';
import { Text, View } from 'react-native';
import { colors } from '../../styles/global';

const TierBadge = ({ tier }) => {
  const isPremium = tier === 'premium';
  const bg = isPremium ? colors.primary : colors.accent;
  const text = isPremium ? '#0C1824' : '#0C1824';
  return (
    <View
      style={{
        backgroundColor: bg,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
      }}
    >
      <Text style={{ color: text, fontWeight: '800' }}>{isPremium ? 'PREMIUM' : 'FREE TIER'}</Text>
    </View>
  );
};

export default TierBadge;
