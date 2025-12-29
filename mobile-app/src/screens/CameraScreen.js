import React from 'react';
import { View, Text, Image } from 'react-native';
import Button from '../components/common/Button';
import { globalStyles, colors } from '../styles/global';
import { captureImage } from '../services/camera';
import { useSubscription } from '../context/SubscriptionContext';

const CameraScreen = () => {
  const { isPremium } = useSubscription();

  const handleCapture = async () => {
    if (!isPremium) return;
    await captureImage();
  };

  return (
    <View style={[globalStyles.screen, { alignItems: 'center' }]}>
      <Text style={globalStyles.heading}>Scan ingredients</Text>
      <Text style={globalStyles.subheading}>Premium perk: detect pantry items via camera.</Text>
      <Image
        source={{ uri: 'https://via.placeholder.com/320x200.png?text=Camera+Preview' }}
        style={{ width: '100%', height: 200, borderRadius: 12, marginVertical: 16 }}
      />
      <Button label="Capture ingredients" onPress={handleCapture} disabled={!isPremium} />
      {!isPremium && (
        <Text style={{ color: colors.accent, marginTop: 10 }}>Upgrade to unlock camera recognition.</Text>
      )}
    </View>
  );
};

export default CameraScreen;
