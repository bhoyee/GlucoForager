import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { globalStyles, colors } from '../../styles/global';

const Header = ({ title, actionLabel, onAction }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
    <Text style={globalStyles.heading}>{title}</Text>
    {actionLabel && onAction ? (
      <TouchableOpacity onPress={onAction}>
        <Text style={{ color: colors.primary, fontWeight: '700' }}>{actionLabel}</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

export default Header;
