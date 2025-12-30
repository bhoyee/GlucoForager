import React, { useState } from 'react';
import { View, Text, Image, Alert } from 'react-native';
import Button from '../components/common/Button';
import { globalStyles, colors } from '../styles/global';
import { captureImage } from '../services/camera';
import { generateVisionRecipes } from '../services/api';
import { useSubscription } from '../context/SubscriptionContext';
import { checkDailyLimit } from '../utils/daily_limit';

const CameraScreen = ({ navigation }) => {
  const { tier, isPremium, scansToday, incrementScan } = useSubscription();
  const [loading, setLoading] = useState(false);

  const handleCapture = async () => {
    const limit = checkDailyLimit(tier, scansToday);
    if (!limit.canScan) {
      Alert.alert('Limit reached', 'Daily limit reached (3 scans). Upgrade for unlimited.');
      return;
    }
    setLoading(true);
    try {
      const img = await captureImage();
      if (!img?.base64) {
        setLoading(false);
        return;
      }
      const res = await generateVisionRecipes(img.base64, null);
      incrementScan();
      navigation.navigate('Results', { results: res.results ?? [] });
    } catch (e) {
      Alert.alert('Error', 'Could not process image.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[globalStyles.screen, { alignItems: 'center' }]}>
      <Text style={globalStyles.heading}>{isPremium ? 'Premium Camera' : 'Free Camera'}</Text>
      <Text style={globalStyles.subheading}>
        {isPremium ? 'Unlimited scans with priority AI' : `Scans today: ${scansToday}/3`}
      </Text>
      <Image
        source={{ uri: 'https://via.placeholder.com/320x200.png?text=Camera+Preview' }}
        style={{ width: '100%', height: 200, borderRadius: 12, marginVertical: 16 }}
      />
      <Button label={loading ? 'Processing...' : 'Capture ingredients'} onPress={handleCapture} disabled={loading} />
      {!isPremium && (
        <Text style={{ color: colors.accent, marginTop: 10 }}>Upgrade to unlock unlimited scans and faster AI.</Text>
      )}
    </View>
  );
};

export default CameraScreen;
