import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import Button from '../components/common/Button';
import { globalStyles, colors } from '../styles/global';

const slides = [
  {
    title: 'AI-Powered Cooking',
    subtitle: 'Snap your fridge; GPT-5 Vision extracts ingredients instantly.',
  },
  {
    title: 'Designed for diabetics',
    subtitle: 'Low-GI prompts keep every recipe diabetes-friendly.',
  },
  {
    title: 'Start free, upgrade anytime',
    subtitle: '3 free scans/day or go premium for unlimited + favorites.',
  },
];

const WelcomeScreen = ({ navigation }) => {
  const [index, setIndex] = useState(0);
  const next = () => setIndex((prev) => Math.min(slides.length - 1, prev + 1));
  const prev = () => setIndex((prev) => Math.max(0, prev - 1));

  const slide = slides[index];

  return (
    <View
      style={[
        globalStyles.screen,
        { justifyContent: 'center', alignItems: 'center', paddingTop: 40, backgroundColor: '#0C1824' },
      ]}
    >
      <View
        style={{
          width: 200,
          height: 200,
          borderRadius: 24,
          backgroundColor: '#10243a',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
        }}
      >
        <Image source={require('../../assets/icons/app-icon.png')} style={{ width: 120, height: 120 }} />
      </View>
      <Text style={[globalStyles.heading, { color: '#fff', textAlign: 'center' }]}>{slide.title}</Text>
      <Text style={[globalStyles.subheading, { textAlign: 'center', color: '#cfd8e3' }]}>{slide.subtitle}</Text>
      <View style={{ flexDirection: 'row', marginVertical: 12 }}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: i === index ? colors.primary : '#243b53',
              marginHorizontal: 4,
            }}
          />
        ))}
      </View>
      <Button label="Get Started" onPress={() => navigation.replace('Login')} />
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        <TouchableOpacity onPress={prev} style={{ marginHorizontal: 8 }}>
          <Text style={{ color: '#cfd8e3' }}>Prev</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={next} style={{ marginHorizontal: 8 }}>
          <Text style={{ color: '#cfd8e3' }}>Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default WelcomeScreen;
