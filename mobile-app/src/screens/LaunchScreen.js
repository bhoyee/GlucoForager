import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { globalStyles, colors } from '../styles/global';
import { useAuth } from '../context/AuthContext';

const LaunchScreen = ({ navigation }) => {
  const { user, token } = useAuth();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (token) {
        navigation.replace('Main');
      } else {
        navigation.replace('Welcome');
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [token, navigation]);

  return (
    <View style={[globalStyles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={{ color: colors.text, marginTop: 12 }}>Loading GlucoForager...</Text>
    </View>
  );
};

export default LaunchScreen;
