import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';

const SWAPS = {
  rice: ['Cauliflower rice', 'Quinoa (small portion)', 'Konjac rice', 'Brown rice (small portion)'],
  bread: ['Whole grain bread (1 slice)', 'Low‑carb wrap', 'Lettuce wrap', 'Sourdough (small portion)'],
  pasta: ['Zucchini noodles', 'Shirataki noodles', 'Spaghetti squash', 'Lentil pasta (small portion)'],
  potato: ['Sweet potato (small portion)', 'Roasted cauliflower', 'Turnips', 'Mixed veggies'],
  fries: ['Air‑fried zucchini', 'Roasted carrots (small portion)', 'Side salad', 'Roasted broccoli'],
  cereal: ['Chia pudding', 'Greek yogurt + berries', 'Steel‑cut oats (small portion)', 'Eggs + veg'],
  noodles: ['Shirataki noodles', 'Zucchini noodles', 'Bean sprouts', 'Cabbage stir‑fry base'],
  tortillas: ['Low‑carb wrap', 'Lettuce wrap', 'Cabbage wrap', 'Corn tortilla (small portion)'],
  pizza: ['Cauliflower crust', 'Thin crust + extra veg', 'Chicken crust', 'Pizza bowl (no crust)'],
  sugar: ['Stevia/erythritol (sparingly)', 'Cinnamon', 'Vanilla + berries', 'Unsweetened yogurt'],
  soda: ['Sparkling water', 'Diet soda (occasionally)', 'Unsweetened iced tea', 'Water + lemon'],
  juice: ['Water + fruit slices', 'Unsweetened tea', 'Diluted juice (small)', 'Eat whole fruit instead'],
  oats: ['Steel‑cut oats (small portion)', 'Chia pudding', 'Greek yogurt bowl', 'Eggs + veg'],
  banana: ['½ banana + nut butter', 'Berries', 'Apple slices (small)', 'Kiwi'],
  crackers: ['Nuts', 'Cheese', 'Cucumber slices', 'Seed crackers'],
  chips: ['Roasted chickpeas (small)', 'Nuts (portion)', 'Popcorn (small)', 'Veg + dip'],
  icecream: ['Greek yogurt + berries', 'Sugar‑free popsicle', 'Chia pudding', 'Dark chocolate (small)'],
};

const normalizeKey = (value) =>
  `${value || ''}`.trim().toLowerCase().replace(/\s+/g, ' ');

export default function CarbSwapsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom + 12, 12);
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const key = normalizeKey(query);
    if (!key) return null;
    if (SWAPS[key]) return { key, items: SWAPS[key] };
    const direct = Object.keys(SWAPS).find((k) => key.includes(k));
    if (direct) return { key: direct, items: SWAPS[direct] };
    return null;
  }, [query]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Swaps</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentBottomPadding }}
      >
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={Colors.textLight} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search a food (e.g. rice, bread, pasta)"
            placeholderTextColor={Colors.textLight}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')} style={styles.clearButton}>
              <Ionicons name="close" size={18} color={Colors.textLight} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Better options</Text>
          {!query ? (
            <>
              <Text style={styles.cardSub}>Try: rice, pasta, bread, potato, cereal…</Text>
              <View style={styles.pills}>
                {['rice', 'pasta', 'bread', 'potato', 'cereal', 'pizza'].map((item) => (
                  <TouchableOpacity key={item} style={styles.pill} onPress={() => setQuery(item)}>
                    <Text style={styles.pillText}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : matches ? (
            <>
              <Text style={styles.cardSub}>
                Swaps for <Text style={styles.bold}>{matches.key}</Text>
              </Text>
              {matches.items.map((item) => (
                <View key={item} style={styles.row}>
                  <Ionicons name="swap-horizontal-outline" size={16} color={Colors.primary} />
                  <Text style={styles.rowText}>{item}</Text>
                </View>
              ))}
              <Text style={styles.disclaimer}>
                These are general suggestions. Portion size and your body’s response matter.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.cardSub}>No swaps found yet for that term.</Text>
              <Text style={styles.disclaimer}>
                Try a more general word (e.g. “bread” instead of a brand name).
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    justifyContent: 'space-between',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRight: { width: 44, height: 44 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
  },
  searchWrap: {
    marginTop: 8,
    marginHorizontal: 20,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    fontWeight: '600',
    paddingVertical: 0,
  },
  clearButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${Colors.border}55`,
  },
  card: {
    marginTop: 14,
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: { fontSize: 18, fontWeight: '900', color: Colors.text },
  cardSub: { marginTop: 6, fontSize: 13, color: Colors.textLight, fontWeight: '600' },
  bold: { color: Colors.text, fontWeight: '900' },
  row: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowText: { flex: 1, fontSize: 14, color: Colors.text, fontWeight: '700' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 10 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: `${Colors.primary}12`,
    borderWidth: 1,
    borderColor: `${Colors.primary}24`,
  },
  pillText: { color: Colors.primary, fontWeight: '800', fontSize: 12 },
  disclaimer: { marginTop: 14, fontSize: 12, lineHeight: 18, color: Colors.textLight },
});

