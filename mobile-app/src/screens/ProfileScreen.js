import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Header from '../components/common/Header';
import { globalStyles, colors } from '../styles/global';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';

const ProfileScreen = ({ navigation }) => {
  const { user, logout } = useAuth();
  const { tier, isPremium } = useSubscription();

  return (
    <View style={globalStyles.screen}>
      <Header title="Profile" />
      <View style={{ padding: 12, backgroundColor: colors.surface, borderRadius: 12, marginBottom: 12 }}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{user?.email ?? 'Guest user'}</Text>
        <Text style={{ color: colors.muted }}>Subscription: {tier}</Text>
      </View>
      <TouchableOpacity onPress={() => navigation.navigate(isPremium ? 'PremiumDashboard' : 'Upgrade')} style={{ marginBottom: 12 }}>
        <Text style={{ color: colors.accent, fontWeight: '700' }}>
          {isPremium ? 'Open Premium Dashboard' : 'Upgrade to Premium'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={logout}>
        <Text style={{ color: colors.muted }}>Log out</Text>
      </TouchableOpacity>
    </View>
  );
};

export default ProfileScreen;
