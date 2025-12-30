import React, { useEffect, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import Header from '../components/common/Header';
import { globalStyles, colors } from '../styles/global';
import { fetchHistory } from '../services/api';
import { useAuth } from '../context/AuthContext';

const HistoryScreen = () => {
  const { token } = useAuth();
  const [items, setItems] = useState([]);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const res = await fetchHistory(token);
      if (res.items) setItems(res.items);
    })();
  }, [token]);

  return (
    <View style={globalStyles.screen}>
      <Header title="Recent AI scans" />
      <Text style={globalStyles.subheading}>Last 20 AI requests</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => `${item.id}`}
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: colors.surface,
              padding: 12,
              borderRadius: 12,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700' }}>{item.type}</Text>
            <Text style={{ color: colors.muted }}>Model: {item.model}</Text>
            <Text style={{ color: colors.muted }}>Tier: {item.tier}</Text>
            <Text style={{ color: colors.muted }}>At: {item.created_at}</Text>
          </View>
        )}
      />
    </View>
  );
};

export default HistoryScreen;
