import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { colors } from '../../styles/global';

const Button = ({ label, onPress, disabled }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    style={{
      backgroundColor: disabled ? colors.muted : colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginVertical: 6,
    }}
  >
    <Text style={{ color: disabled ? '#0C1824' : '#0C1824', fontWeight: '700' }}>{label}</Text>
  </TouchableOpacity>
);

export default Button;
