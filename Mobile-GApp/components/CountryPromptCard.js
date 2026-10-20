// components/CountryPromptCard.js
// One-off "Are you in <country>?" card on Home. Only shown when the backend isn't sure
// (IP and phone region disagree, or nothing is known), at most twice ever.
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { countries } from '../utils/countries';
import { answerCountry, countryName } from '../utils/region';

export default function CountryPromptCard({ suggested, onDone }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const name = countryName(suggested);

  const answer = async (action, code) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await answerCountry(action, code);
      onDone?.(result);
    } finally {
      setBusy(false);
      setPickerOpen(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? countries.filter((c) => c.name.toLowerCase().includes(q)) : countries;
  }, [search]);

  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <Ionicons name="globe-outline" size={20} color="#2B6CB0" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{name ? `Are you in ${name}?` : 'Which country are you in?'}</Text>
        <Text style={styles.text}>We use this for food labels and recipe ideas.</Text>
        <View style={styles.actions}>
          {name ? (
            <TouchableOpacity style={styles.primary} onPress={() => answer('confirm', suggested)} disabled={busy} activeOpacity={0.85}>
              <Text style={styles.primaryText}>Yes</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={name ? styles.secondary : styles.primary} onPress={() => setPickerOpen(true)} disabled={busy} activeOpacity={0.85}>
            <Text style={name ? styles.secondaryText : styles.primaryText}>{name ? 'Change' : 'Choose'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => answer('snooze')} disabled={busy} hitSlop={8}>
            <Text style={styles.later}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Your country</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={Colors.textLight} />
              </TouchableOpacity>
            </View>
            <View style={styles.search}>
              <Ionicons name="search" size={16} color={Colors.textLight} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search countries"
                placeholderTextColor={Colors.textMuted}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
              />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(c) => c.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.row} onPress={() => answer('set', item.code)} activeOpacity={0.75}>
                  <Text style={styles.rowText}>{item.name}</Text>
                  {item.code === suggested ? <Ionicons name="location" size={16} color={Colors.primary} /> : null}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#EEF5FD',
    borderWidth: 1,
    borderColor: '#CADDF4',
    marginBottom: 12,
  },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '900', color: Colors.brandNavy },
  text: { fontSize: 12.5, color: Colors.textLight, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  primary: { backgroundColor: '#2B6CB0', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 8 },
  primaryText: { color: 'white', fontWeight: '900', fontSize: 13.5 },
  secondary: { backgroundColor: 'white', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#CADDF4' },
  secondaryText: { color: '#2B6CB0', fontWeight: '900', fontSize: 13.5 },
  later: { color: Colors.textLight, fontWeight: '800', fontSize: 13 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,42,58,0.45)', justifyContent: 'flex-end' },
  sheet: { height: '75%', backgroundColor: 'white', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: Colors.brandNavy },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F4F6F2', borderRadius: 12, paddingHorizontal: 12, marginBottom: 8 },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: Colors.brandNavy },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F2EC' },
  rowText: { fontSize: 15, color: Colors.brandNavy, fontWeight: '700' },
});
