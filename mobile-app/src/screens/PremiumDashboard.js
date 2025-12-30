import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import TierBadge from '../components/common/TierBadge';
import Button from '../components/common/Button';
import { globalStyles, colors } from '../styles/global';
import { useSubscription } from '../context/SubscriptionContext';
import { useFavorites } from '../context/FavoritesContext';

const PremiumDashboard = ({ navigation }) => {
  const { scansToday } = useSubscription();
  const { favorites } = useFavorites();

  return (
    <ScrollView style={globalStyles.screen}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TierBadge tier="premium" />
        <Text style={{ color: colors.muted }}>Scans today: {scansToday} (unlimited)</Text>
      </View>
      <Text style={globalStyles.heading}>Premium Dashboard</Text>
      <Text style={globalStyles.subheading}>Priority AI, unlimited scans, and advanced tools.</Text>

      <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginVertical: 8 }}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>Quick actions</Text>
        <Button label="Open premium camera" onPress={() => navigation.navigate('PremiumCamera')} />
        <Button label="Text to recipes" onPress={() => navigation.navigate('Home')} />
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginVertical: 8 }}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>Upcoming perks</Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>
          Detailed nutrition, meal planning, dietary filters, and shopping lists are prioritized for premium users.
        </Text>
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginVertical: 8 }}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>Stats</Text>
        <Text style={{ color: colors.muted, marginTop: 6 }}>Favorites saved: {favorites.length}</Text>
        <Text style={{ color: colors.muted }}>Scans today: {scansToday}</Text>
      </View>

      <Text style={{ color: colors.muted, marginTop: 12, textAlign: 'center' }}>Premium status active.</Text>
    </ScrollView>
  );
};

export default PremiumDashboard;
