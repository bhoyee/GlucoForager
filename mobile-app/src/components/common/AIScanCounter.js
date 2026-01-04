import React from 'react';
import { View, Text } from 'react-native';
import { colors } from '../../styles/global';

const AIScanCounter = ({ scansToday, isPremium }) => (
  <View
    style={{
      backgroundColor: colors.surface,
      padding: 10,
      borderRadius: 10,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginVertical: 8,
    }}
  >
    <Text style={{ color: colors.text, fontWeight: '700' }}>{isPremium ? 'Unlimited scans' : 'Free tier scans'}</Text>
    <Text style={{ color: colors.muted }}>{isPremium ? 'Unlimited' : `${scansToday}/3 today`}</Text>
  </View>
);

export default AIScanCounter;
