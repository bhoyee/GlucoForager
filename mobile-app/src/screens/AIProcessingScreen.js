import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { globalStyles, colors } from '../styles/global';

const AIProcessingScreen = ({ route, navigation }) => {
  const { navigateTo, payload } = route.params || {};

  useEffect(() => {
    const timer = setTimeout(() => {
      if (navigateTo) {
        navigation.replace(navigateTo, payload || {});
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [navigateTo, payload, navigation]);

  return (
    <View style={[globalStyles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={{ color: colors.text, marginTop: 12 }}>AI is analyzing your fridge...</Text>
      <Text style={{ color: colors.muted, marginTop: 6 }}>Analyzing image → Identifying ingredients → Generating recipes</Text>
    </View>
  );
};

export default AIProcessingScreen;
