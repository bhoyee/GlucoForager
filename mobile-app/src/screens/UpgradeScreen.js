import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import Header from '../components/common/Header';
import PlanCard from '../components/subscription/PlanCard';
import FeatureList from '../components/subscription/FeatureList';
import Button from '../components/common/Button';
import { SUBSCRIPTION_PLANS } from '../utils/constants';
import { globalStyles, colors } from '../styles/global';
import { useSubscription } from '../context/SubscriptionContext';
import { startCheckout } from '../services/revenuecat';

const UpgradeScreen = () => {
  const [selected, setSelected] = useState('premium');
  const { upgrade } = useSubscription();

  const handleUpgrade = async () => {
    const res = await startCheckout();
    if (res.status === 'mock') {
      upgrade();
      Alert.alert('Upgraded (mock)', 'RevenueCat integration not yet implemented.');
    }
  };

  return (
    <View style={globalStyles.screen}>
      <Header title="Upgrade to Premium" />
      <Text style={globalStyles.subheading}>Camera ingredient recognition, unlimited searches, and no ads.</Text>
      {SUBSCRIPTION_PLANS.map((plan) => (
        <PlanCard key={plan.id} plan={plan} selected={selected === plan.id} onSelect={setSelected} />
      ))}
      <FeatureList
        items={[
          'Camera photo recognition',
          'Unlimited searches',
          'Favorites and history',
          'Ad-free experience',
        ]}
      />
      <Button label="Start 7-day free trial" onPress={handleUpgrade} />
      <Text style={{ color: colors.muted, marginTop: 8 }}>£2.99/month after trial. Cancel anytime.</Text>
    </View>
  );
};

export default UpgradeScreen;
