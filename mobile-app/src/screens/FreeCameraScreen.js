import React, { useState } from 'react';
import { View, Text, Image, Alert, TouchableOpacity } from 'react-native';
import Button from '../components/common/Button';
import TierBadge from '../components/common/TierBadge';
import AIProcessingModal from '../components/ai/AIProcessingModal';
import { globalStyles, colors } from '../styles/global';
import { captureImage } from '../services/camera';
import { generateVisionRecipes } from '../services/api';
import { useSubscription } from '../context/SubscriptionContext';
import { checkDailyLimit } from '../utils/daily_limit';

const FreeCameraScreen = ({ navigation }) => {
  const { tier, scansToday, incrementScan } = useSubscription();
  const [loading, setLoading] = useState(false);

  const handleCapture = async () => {
    const limit = checkDailyLimit(tier, scansToday);
    if (!limit.canScan) {
      Alert.alert('Limit reached', 'Daily limit reached (3 scans). Upgrade for unlimited.', [
        { text: 'Upgrade', onPress: () => navigation.navigate('Upgrade') },
        { text: 'OK' },
      ]);
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
    <View style={[globalStyles.screen]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TierBadge tier="free" />
        <Text style={{ color: colors.muted }}>Scans today: {scansToday}/3</Text>
      </View>
      <Text style={globalStyles.heading}>Free Camera</Text>
      <Text style={globalStyles.subheading}>3 scans/day. Upgrade for unlimited AI vision.</Text>
      <Image
        source={{ uri: 'https://via.placeholder.com/320x200.png?text=Free+Camera' }}
        style={{ width: '100%', height: 200, borderRadius: 12, marginVertical: 16 }}
      />
      <Button label={loading ? 'Processing...' : 'Capture & Analyze'} onPress={handleCapture} disabled={loading} />
      <TouchableOpacity onPress={() => navigation.navigate('Upgrade')} style={{ marginTop: 12 }}>
        <Text style={{ color: colors.accent, fontWeight: '700' }}>Upgrade for unlimited scans</Text>
      </TouchableOpacity>
      <AIProcessingModal visible={loading} message="Analyzing your fridge photo..." />
    </View>
  );
};

export default FreeCameraScreen;
