import React from 'react';
import { View, Text, Image } from 'react-native';
import Button from '../components/common/Button';
import { globalStyles, colors } from '../styles/global';

const WelcomeScreen = ({ navigation }) => {
  return (
    <View style={[globalStyles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
      <Image
        source={{ uri: 'https://via.placeholder.com/220x220.png?text=GlucoForager' }}
        style={{ width: 200, height: 200, marginBottom: 24 }}
      />
      <Text style={globalStyles.heading}>"Diabetes-friendly recipes from your fridge in seconds"</Text>
      <Text style={[globalStyles.subheading, { textAlign: 'center' }]}>
        Save time and cook safer meals with ingredient-level checks.
      </Text>
      <Button label="Get Started" onPress={() => navigation.replace('Main')} />
    </View>
  );
};

export default WelcomeScreen;
