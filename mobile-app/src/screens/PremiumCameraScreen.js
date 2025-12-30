import React, { useState } from 'react';
import { View, Text, Image, Alert, Switch, TouchableOpacity } from 'react-native';
import Button from '../components/common/Button';
import TierBadge from '../components/common/TierBadge';
import AIProcessingModal from '../components/ai/AIProcessingModal';
import { globalStyles, colors } from '../styles/global';
import { captureImage } from '../services/camera';
import { generateVisionRecipes } from '../services/api';
import { useSubscription } from '../context/SubscriptionContext';

const DIETARY_FILTERS = ['Low-carb', 'High-fiber', 'Gluten-free', 'Dairy-free'];

const PremiumCameraScreen = ({ navigation }) => {
  const { incrementScan } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [highQuality, setHighQuality] = useState(true);
  const [filters, setFilters] = useState([]);

  const toggleFilter = (filter) => {
    setFilters((prev) => (prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter]));
  };

  const handleCapture = async () => {
    setLoading(true);
    try {
      const img = await captureImage();
      if (!img?.base64) {
        setLoading(false);
        return;
      }
      const res = await generateVisionRecipes(img.base64, null);
      incrementScan();
      navigation.navigate('Results', { results: res.results ?? [], filters, highQuality });
    } catch (e) {
      Alert.alert('Error', 'Could not process image.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[globalStyles.screen]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TierBadge tier="premium" />
        <Text style={{ color: colors.muted }}>Unlimited scans • Priority AI</Text>
      </View>
      <Text style={globalStyles.heading}>Premium Camera</Text>
      <Text style={globalStyles.subheading}>Advanced AI analysis with priority processing.</Text>
      <Image
        source={{ uri: 'https://via.placeholder.com/320x200.png?text=Premium+Camera' }}
        style={{ width: '100%', height: 200, borderRadius: 12, marginVertical: 16 }}
      />
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: colors.text }}>High-quality AI mode</Text>
        <Switch value={highQuality} onValueChange={setHighQuality} thumbColor={colors.primary} />
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>Dietary filters</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {DIETARY_FILTERS.map((filter) => {
            const active = filters.includes(filter);
            return (
              <TouchableOpacity
                key={filter}
                onPress={() => toggleFilter(filter)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 10,
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderWidth: 1,
                  borderColor: colors.primary,
                }}
              >
                <Text style={{ color: active ? '#0C1824' : colors.text }}>{filter}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={{ color: colors.muted, marginTop: 6 }}>Applied locally; backend filters coming soon.</Text>
      </View>

      <Button label={loading ? 'Processing...' : 'Capture & Analyze'} onPress={handleCapture} disabled={loading} />
      <AIProcessingModal visible={loading} message="Running premium AI analysis..." />
    </View>
  );
};

export default PremiumCameraScreen;
