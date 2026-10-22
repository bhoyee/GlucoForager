// screens/main/ShoppingListScreen.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../context/authContext';
import KeyboardAwareScrollView from '../../components/KeyboardAwareScrollView';

const checkedStorageKey = (listId) => `shopping_checked_${listId}`;

// Rough supermarket aisles, so a list reads the way you walk the shop.
const AISLES = [
  {
    key: 'veg',
    label: 'Fruit & veg',
    icon: 'leaf',
    color: '#2C8632',
    bg: '#E9F6EA',
    words: ['spinach', 'kale', 'lettuce', 'tomato', 'onion', 'garlic', 'pepper', 'carrot', 'cucumber', 'broccoli', 'cauliflower', 'cabbage', 'courgette', 'zucchini', 'mushroom', 'avocado', 'lemon', 'lime', 'apple', 'banana', 'berries', 'berry', 'orange', 'ginger', 'celery', 'potato', 'yam', 'plantain', 'okra', 'herb', 'parsley', 'coriander', 'cilantro', 'basil', 'mint', 'chilli', 'chili', 'leek', 'squash', 'pumpkin', 'beans', 'peas', 'salad', 'rocket', 'aubergine', 'eggplant', 'fruit', 'vegetable', 'veg'],
  },
  {
    key: 'protein',
    label: 'Meat & fish',
    icon: 'fish',
    color: '#C05621',
    bg: '#FFF1E6',
    words: ['chicken', 'beef', 'turkey', 'lamb', 'pork', 'fish', 'salmon', 'tuna', 'cod', 'mackerel', 'sardine', 'prawn', 'shrimp', 'tilapia', 'goat', 'mince', 'steak', 'tofu', 'tempeh'],
  },
  {
    key: 'dairy',
    label: 'Dairy & eggs',
    icon: 'egg',
    color: '#B7791F',
    bg: '#FFF7E0',
    words: ['egg', 'milk', 'yogurt', 'yoghurt', 'cheese', 'butter', 'cream', 'kefir', 'feta', 'mozzarella', 'cheddar', 'parmesan', 'cottage'],
  },
  {
    key: 'grains',
    label: 'Grains & bakery',
    icon: 'nutrition',
    color: '#8B5E34',
    bg: '#F5EDE4',
    words: ['rice', 'oat', 'bread', 'pasta', 'quinoa', 'flour', 'wrap', 'tortilla', 'noodle', 'couscous', 'barley', 'bulgur', 'cereal', 'cracker', 'semolina'],
  },
  {
    key: 'pantry',
    label: 'Pantry',
    icon: 'flask',
    color: '#6B46C1',
    bg: '#F0EBFB',
    words: ['oil', 'salt', 'vinegar', 'sauce', 'spice', 'cumin', 'paprika', 'turmeric', 'cinnamon', 'stock', 'broth', 'seed', 'nut', 'almond', 'walnut', 'peanut', 'lentil', 'chickpea', 'honey', 'mustard', 'soy', 'curry', 'thyme', 'oregano', 'powder', 'tin', 'canned', 'paste', 'sweetener', 'stevia'],
  },
];
const OTHER = { key: 'other', label: 'Other', icon: 'basket', color: '#4A5568', bg: '#EDF2F7' };

const itemText = (item) => (typeof item === 'string' ? item : item?.name || 'Item');

const aisleFor = (text) => {
  const t = String(text || '').toLowerCase();
  return AISLES.find((a) => a.words.some((w) => t.includes(w))) || OTHER;
};

const isPlanList = (title) => /meal plan/i.test(String(title || ''));

export default function ShoppingListScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom + 12, 12);

  const [lists, setLists] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [checkedByListId, setCheckedByListId] = useState({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [newListItems, setNewListItems] = useState(['']);
  const [isSavingNewList, setIsSavingNewList] = useState(false);
  const [newItemTextByListId, setNewItemTextByListId] = useState({});
  const [busyListId, setBusyListId] = useState(null);

  const loadCheckedState = async (listId) => {
    try {
      const raw = await AsyncStorage.getItem(checkedStorageKey(listId));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const saveChecked = async (listId, next) => {
    setCheckedByListId((prev) => ({ ...prev, [listId]: next }));
    try {
      await AsyncStorage.setItem(checkedStorageKey(listId), JSON.stringify(next));
    } catch {
      // Ignore storage errors - checked state just won't persist across sessions.
    }
  };

  const loadLists = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setLists([]);
        return;
      }
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.SHOPPING_LIST}`,
        { headers: { Authorization: `Bearer ${token}` } },
        { onUnauthorized: signOut }
      );
      if (response.status === 401) {
        setLists([]);
        return;
      }
      const data = await response.json().catch(() => ({}));
      const items = Array.isArray(data.items) ? data.items : [];
      setLists(items);
      // Open the newest list by default so the screen is useful straight away.
      setExpandedId((prev) => (prev && items.some((l) => l.id === prev) ? prev : items[0]?.id ?? null));

      const checkedEntries = await Promise.all(items.map(async (item) => [item.id, await loadCheckedState(item.id)]));
      setCheckedByListId(Object.fromEntries(checkedEntries));
    } catch (error) {
      Alert.alert('Error', 'Unable to load shopping lists right now.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [signOut]);

  useEffect(() => {
    if (isFocused) loadLists();
  }, [isFocused, loadLists]);

  const onRefresh = () => {
    setRefreshing(true);
    loadLists();
  };

  const totals = useMemo(() => {
    let total = 0;
    let bought = 0;
    lists.forEach((l) => {
      const n = Array.isArray(l.items) ? l.items.length : 0;
      total += n;
      bought += Math.min((checkedByListId[l.id] || []).length, n);
    });
    return { total, bought };
  }, [lists, checkedByListId]);

  const toggleItemChecked = (listId, index) => {
    const current = checkedByListId[listId] || [];
    const next = current.includes(index) ? current.filter((i) => i !== index) : [...current, index];
    saveChecked(listId, next);
  };

  const patchItems = async (listId, nextItems) => {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return false;
    const response = await apiFetch(
      `${API_URL}${API_ENDPOINTS.SHOPPING_LIST}/${listId}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: nextItems }),
      },
      { onUnauthorized: signOut }
    );
    if (!response.ok) return false;
    setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, items: nextItems } : l)));
    return true;
  };

  const removeItem = (list, index) => {
    const items = (Array.isArray(list.items) ? list.items : []).map(itemText);
    Alert.alert('Remove item', `Remove "${items[index]}" from this list?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusyListId(list.id);
          try {
            const ok = await patchItems(list.id, items.filter((_, i) => i !== index));
            if (!ok) {
              Alert.alert('Error', 'Unable to remove this item right now.');
              return;
            }
            // Ticks are stored by position: shift the ones after the removed item.
            const checked = (checkedByListId[list.id] || []).filter((i) => i !== index).map((i) => (i > index ? i - 1 : i));
            saveChecked(list.id, checked);
          } finally {
            setBusyListId(null);
          }
        },
      },
    ]);
  };

  const clearBought = async (list) => {
    const checked = checkedByListId[list.id] || [];
    if (!checked.length) return;
    const items = (Array.isArray(list.items) ? list.items : []).map(itemText);
    setBusyListId(list.id);
    try {
      const ok = await patchItems(list.id, items.filter((_, i) => !checked.includes(i)));
      if (!ok) {
        Alert.alert('Error', 'Unable to update this list right now.');
        return;
      }
      saveChecked(list.id, []);
    } finally {
      setBusyListId(null);
    }
  };

  const shareList = async (list) => {
    const items = (Array.isArray(list.items) ? list.items : []).map(itemText);
    const checked = checkedByListId[list.id] || [];
    const lines = items.filter((_, i) => !checked.includes(i)).map((t) => `• ${t}`);
    try {
      await Share.share({ message: `${list.title}\n\n${lines.join('\n') || 'All bought!'}\n\nFrom GlucoForager` });
    } catch {
      // Share sheet dismissed.
    }
  };

  const deleteList = (listId, title) => {
    Alert.alert('Delete shopping list', `Remove "${title}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await AsyncStorage.getItem('userToken');
            if (!token) return;
            const response = await apiFetch(
              `${API_URL}${API_ENDPOINTS.SHOPPING_LIST}/${listId}`,
              { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
              { onUnauthorized: signOut }
            );
            if (!response.ok) {
              Alert.alert('Error', 'Unable to delete this list right now.');
              return;
            }
            setLists((prev) => prev.filter((item) => item.id !== listId));
            await AsyncStorage.removeItem(checkedStorageKey(listId));
          } catch (error) {
            Alert.alert('Error', 'Unable to delete this list right now.');
          }
        },
      },
    ]);
  };

  const openCreateModal = () => {
    setNewListTitle('');
    setNewListItems(['']);
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    if (isSavingNewList) return;
    setShowCreateModal(false);
  };

  const updateNewListItem = (index, text) => {
    setNewListItems((prev) => prev.map((item, i) => (i === index ? text : item)));
  };

  const addNewListItemRow = () => {
    setNewListItems((prev) => [...prev, '']);
  };

  const removeNewListItemRow = (index) => {
    setNewListItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const saveNewList = async () => {
    if (isSavingNewList) return;
    const title = newListTitle.trim();
    if (!title) {
      Alert.alert('Title required', 'Give your shopping list a name.');
      return;
    }
    const items = newListItems.map((item) => item.trim()).filter(Boolean);
    try {
      setIsSavingNewList(true);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to save a shopping list.');
        return;
      }
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.SHOPPING_LIST}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, items }),
        },
        { onUnauthorized: signOut }
      );
      if (!response.ok) {
        Alert.alert('Error', 'Unable to save this list right now.');
        return;
      }
      const data = await response.json().catch(() => ({}));
      setShowCreateModal(false);
      await loadLists();
      if (data?.id) setExpandedId(data.id);
    } catch (error) {
      Alert.alert('Error', 'Unable to save this list right now.');
    } finally {
      setIsSavingNewList(false);
    }
  };

  const addItemToList = async (list) => {
    const text = (newItemTextByListId[list.id] || '').trim();
    if (!text || busyListId === list.id) return;
    const existing = (Array.isArray(list.items) ? list.items : []).map(itemText);
    setBusyListId(list.id);
    try {
      const ok = await patchItems(list.id, [...existing, text]);
      if (!ok) {
        Alert.alert('Error', 'Unable to add this item right now.');
        return;
      }
      setNewItemTextByListId((prev) => ({ ...prev, [list.id]: '' }));
    } catch (error) {
      Alert.alert('Error', 'Unable to add this item right now.');
    } finally {
      setBusyListId(null);
    }
  };

  const progressPct = totals.total ? Math.round((totals.bought / totals.total) * 100) : 0;

  return (
    <View style={styles.container}>
      <View style={[styles.headerPanel, { paddingTop: headerPaddingTop }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Shopping list</Text>
            <Text style={styles.headerSubtitle}>
              {isLoading
                ? 'Loading your lists…'
                : lists.length
                  ? `${lists.length} ${lists.length === 1 ? 'list' : 'lists'} · ${totals.total - totals.bought} to buy`
                  : 'Nothing to buy yet'}
            </Text>
          </View>
          <TouchableOpacity style={styles.addButton} onPress={openCreateModal} accessibilityLabel="New list">
            <Ionicons name="add" size={24} color={Colors.primaryDark} />
          </TouchableOpacity>
        </View>
        {totals.total > 0 ? (
          <View style={styles.headerProgress}>
            <View style={styles.headerProgressTrack}>
              <View style={[styles.headerProgressFill, { width: `${Math.max(progressPct, 3)}%` }]} />
            </View>
            <Text style={styles.headerProgressText}>
              {totals.bought} of {totals.total} bought
            </Text>
          </View>
        ) : null}
      </View>

      <KeyboardAwareScrollView
        style={{ marginTop: -28 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 28, paddingBottom: contentBottomPadding + 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} progressViewOffset={28} />}
      >
        <View style={styles.content}>
          {isLoading ? (
            [0, 1].map((k) => (
              <View key={k} style={[styles.listCard, styles.skeletonCard]}>
                <View style={styles.skeletonIcon} />
                <View style={{ flex: 1, gap: 8 }}>
                  <View style={[styles.skeletonLine, { width: '60%' }]} />
                  <View style={[styles.skeletonLine, { width: '35%' }]} />
                </View>
              </View>
            ))
          ) : lists.length === 0 ? (
            <View style={styles.emptyContainer}>
              <LinearGradient colors={['#E9F6EA', '#CFE6E1']} style={styles.emptyIcon}>
                <Ionicons name="cart" size={40} color={Colors.primary} />
              </LinearGradient>
              <Text style={styles.emptyTitle}>Your shopping list is empty</Text>
              <Text style={styles.emptySubtitle}>
                Add ingredients from any recipe or from your meal plan, or start a list of your own.
              </Text>
              <TouchableOpacity style={styles.emptyCreateShadow} onPress={openCreateModal} activeOpacity={0.9}>
                <LinearGradient colors={['#23807E', '#0B5A46']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyCreateButton}>
                  <Ionicons name="add" size={19} color="white" />
                  <Text style={styles.emptyCreateButtonText}>New list</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            lists.map((list) => {
              const items = (Array.isArray(list.items) ? list.items : []).map(itemText);
              const checked = checkedByListId[list.id] || [];
              const bought = Math.min(checked.length, items.length);
              const expanded = expandedId === list.id;
              const plan = isPlanList(list.title);
              const pct = items.length ? (bought / items.length) * 100 : 0;
              const done = items.length > 0 && bought === items.length;

              // Group what's left to buy by aisle; bought items go to the basket at the end.
              const groups = [];
              items.forEach((text, index) => {
                if (checked.includes(index)) return;
                const aisle = aisleFor(text);
                let g = groups.find((x) => x.aisle.key === aisle.key);
                if (!g) {
                  g = { aisle, rows: [] };
                  groups.push(g);
                }
                g.rows.push({ text, index });
              });
              const order = [...AISLES.map((a) => a.key), OTHER.key];
              groups.sort((a, b) => order.indexOf(a.aisle.key) - order.indexOf(b.aisle.key));
              const basket = items.map((text, index) => ({ text, index })).filter((r) => checked.includes(r.index));

              return (
                <View key={list.id} style={styles.listCard}>
                  <TouchableOpacity
                    style={styles.listHeader}
                    onPress={() => setExpandedId((prev) => (prev === list.id ? null : list.id))}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={done ? ['#56C75D', '#2C8632'] : plan ? ['#8B6BD9', '#6B46C1'] : ['#23807E', '#0B5A46']}
                      style={styles.listHeaderIcon}
                    >
                      <Ionicons name={done ? 'checkmark' : plan ? 'calendar' : 'cart'} size={19} color="white" />
                    </LinearGradient>
                    <View style={styles.listHeaderText}>
                      <Text style={styles.listTitle} numberOfLines={1}>
                        {list.title}
                      </Text>
                      <View style={styles.listProgressRow}>
                        <View style={styles.listProgressTrack}>
                          <View style={[styles.listProgressFill, { width: `${Math.max(pct, items.length ? 4 : 0)}%` }, done && { backgroundColor: '#2C8632' }]} />
                        </View>
                        <Text style={styles.listMeta}>
                          {done ? 'All bought' : `${bought} of ${items.length}`}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.textLight} />
                  </TouchableOpacity>

                  {expanded ? (
                    <View style={styles.itemsList}>
                      <View style={styles.listActions}>
                        <TouchableOpacity style={styles.listAction} onPress={() => shareList(list)}>
                          <Ionicons name="share-social-outline" size={15} color={Colors.primary} />
                          <Text style={styles.listActionText}>Share</Text>
                        </TouchableOpacity>
                        {bought ? (
                          <TouchableOpacity style={styles.listAction} onPress={() => clearBought(list)} disabled={busyListId === list.id}>
                            <Ionicons name="checkmark-done-outline" size={15} color={Colors.primary} />
                            <Text style={styles.listActionText}>Clear bought</Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity style={[styles.listAction, styles.listActionDanger]} onPress={() => deleteList(list.id, list.title)}>
                          <Ionicons name="trash-outline" size={15} color="#C53030" />
                          <Text style={[styles.listActionText, { color: '#C53030' }]}>Delete</Text>
                        </TouchableOpacity>
                      </View>

                      {items.length === 0 ? <Text style={styles.emptyItemsText}>No items yet. Add one below.</Text> : null}

                      {groups.map(({ aisle, rows }) => (
                        <View key={aisle.key} style={styles.aisle}>
                          <View style={styles.aisleHead}>
                            <View style={[styles.aisleIcon, { backgroundColor: aisle.bg }]}>
                              <Ionicons name={aisle.icon} size={12} color={aisle.color} />
                            </View>
                            <Text style={[styles.aisleLabel, { color: aisle.color }]}>{aisle.label}</Text>
                          </View>
                          {rows.map(({ text, index }) => (
                            <TouchableOpacity
                              key={`${list.id}-${index}`}
                              style={styles.itemRow}
                              onPress={() => toggleItemChecked(list.id, index)}
                              onLongPress={() => removeItem(list, index)}
                              activeOpacity={0.7}
                            >
                              <View style={styles.checkbox} />
                              <Text style={styles.itemText}>{text}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ))}

                      {basket.length ? (
                        <View style={styles.basket}>
                          <Text style={styles.basketLabel}>In your basket · {basket.length}</Text>
                          {basket.map(({ text, index }) => (
                            <TouchableOpacity
                              key={`${list.id}-${index}`}
                              style={styles.itemRow}
                              onPress={() => toggleItemChecked(list.id, index)}
                              onLongPress={() => removeItem(list, index)}
                              activeOpacity={0.7}
                            >
                              <View style={[styles.checkbox, styles.checkboxOn]}>
                                <Ionicons name="checkmark" size={14} color="white" />
                              </View>
                              <Text style={[styles.itemText, styles.itemTextChecked]}>{text}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : null}

                      <View style={styles.addItemRow}>
                        <TextInput
                          style={styles.addItemInput}
                          placeholder="Add an item…"
                          placeholderTextColor={Colors.textMuted}
                          value={newItemTextByListId[list.id] || ''}
                          onChangeText={(text) => setNewItemTextByListId((prev) => ({ ...prev, [list.id]: text }))}
                          onSubmitEditing={() => addItemToList(list)}
                          returnKeyType="done"
                        />
                        <TouchableOpacity style={styles.addItemButton} onPress={() => addItemToList(list)} disabled={busyListId === list.id}>
                          {busyListId === list.id ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="add" size={20} color="white" />}
                        </TouchableOpacity>
                      </View>
                      {items.length ? <Text style={styles.hint}>Tap to tick off · hold to remove</Text> : null}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </KeyboardAwareScrollView>

      <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={closeCreateModal}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 12) + 20 }]}>
            <View style={styles.modalGrabber} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>New shopping list</Text>
                <Text style={styles.modalSubtitle}>We&apos;ll sort items by aisle for you.</Text>
              </View>
              <TouchableOpacity style={styles.modalClose} onPress={closeCreateModal} disabled={isSavingNewList}>
                <Ionicons name="close" size={20} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalTitleInput}
              placeholder="List name (e.g. Weekend groceries)"
              placeholderTextColor={Colors.textMuted}
              value={newListTitle}
              onChangeText={setNewListTitle}
              editable={!isSavingNewList}
            />

            <ScrollView style={styles.modalItemsScroll} keyboardShouldPersistTaps="handled">
              {newListItems.map((item, index) => (
                <View key={index} style={styles.modalItemRow}>
                  <TextInput
                    style={styles.modalItemInput}
                    placeholder={`Item ${index + 1}`}
                    placeholderTextColor={Colors.textMuted}
                    value={item}
                    onChangeText={(text) => updateNewListItem(index, text)}
                    onSubmitEditing={index === newListItems.length - 1 ? addNewListItemRow : undefined}
                    editable={!isSavingNewList}
                  />
                  {index === newListItems.length - 1 ? (
                    <TouchableOpacity style={styles.modalRowButton} onPress={addNewListItemRow} disabled={isSavingNewList}>
                      <Ionicons name="add" size={18} color="white" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.modalRowRemoveButton} onPress={() => removeNewListItemRow(index)} disabled={isSavingNewList}>
                      <Ionicons name="close-circle" size={22} color={Colors.textLight} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.modalSaveShadow} onPress={saveNewList} disabled={isSavingNewList} activeOpacity={0.9}>
              <LinearGradient
                colors={['#23807E', '#0B5A46']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.modalSaveButton, isSavingNewList && styles.modalSaveButtonDisabled]}
              >
                {isSavingNewList ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.modalSaveButtonText}>Save list</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const CARD_SHADOW = {
  shadowColor: '#0F2A3A',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerPanel: {
    zIndex: 10,
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: { flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 21, fontWeight: '900', color: 'white' },
  headerSubtitle: { marginTop: 2, fontSize: 13, color: 'rgba(255,255,255,0.78)', fontWeight: '600' },
  headerProgress: { marginTop: 16, gap: 6 },
  headerProgressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  headerProgressFill: { height: '100%', borderRadius: 4, backgroundColor: '#B9F6CA' },
  headerProgressText: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.85)' },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 14 },
  skeletonCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  skeletonIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#E8EEEC' },
  skeletonLine: { height: 11, borderRadius: 6, backgroundColor: '#E8EEEC' },
  emptyContainer: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 },
  emptyIcon: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: Colors.brandNavy, marginTop: 18, marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: Colors.textLight, textAlign: 'center', lineHeight: 20 },
  emptyCreateShadow: { marginTop: 22, borderRadius: 16, shadowColor: '#0B5A46', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  emptyCreateButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 26, height: 52, borderRadius: 16 },
  emptyCreateButtonText: { color: 'white', fontSize: 15, fontWeight: '900' },
  listCard: {
    backgroundColor: 'white',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#EDF0EA',
    overflow: 'hidden',
    ...CARD_SHADOW,
  },
  listHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  listHeaderIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  listHeaderText: { flex: 1, minWidth: 0 },
  listTitle: { fontSize: 15.5, fontWeight: '900', color: Colors.brandNavy },
  listProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 },
  listProgressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#E5EEEC', overflow: 'hidden' },
  listProgressFill: { height: '100%', borderRadius: 3, backgroundColor: Colors.primary },
  listMeta: { fontSize: 12, color: Colors.textLight, fontWeight: '800' },
  itemsList: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: '#EEF2EF' },
  listActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 12, paddingBottom: 4 },
  listAction: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E8F4F3', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  listActionDanger: { backgroundColor: '#FDECEC' },
  listActionText: { fontSize: 12.5, fontWeight: '800', color: Colors.primary },
  emptyItemsText: { marginTop: 12, fontSize: 13, color: Colors.textLight },
  aisle: { marginTop: 12 },
  aisleHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  aisleIcon: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  aisleLabel: { fontSize: 11.5, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#B8C7C3', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: '#2C8632', borderColor: '#2C8632' },
  itemText: { flex: 1, fontSize: 14.5, color: Colors.brandNavy, fontWeight: '600', textTransform: 'none' },
  itemTextChecked: { color: Colors.textLight, textDecorationLine: 'line-through' },
  basket: { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EEF2EF', borderStyle: 'dashed' },
  basketLabel: { fontSize: 11.5, fontWeight: '900', color: '#2C8632', textTransform: 'uppercase', letterSpacing: 0.5 },
  addItemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  addItemInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#DCE6E3',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14.5,
    color: Colors.text,
    backgroundColor: '#F7FAF9',
  },
  addItemButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  hint: { marginTop: 10, fontSize: 11.5, color: Colors.textMuted, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(7, 29, 24, 0.55)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: 'white', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 10, maxHeight: '82%' },
  modalGrabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#D9E2DF', marginBottom: 14 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: Colors.brandNavy },
  modalSubtitle: { fontSize: 13, color: Colors.textLight, marginTop: 2 },
  modalClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F3', alignItems: 'center', justifyContent: 'center' },
  modalTitleInput: {
    borderWidth: 1.5,
    borderColor: '#DCE6E3',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15.5,
    fontWeight: '700',
    color: Colors.text,
    backgroundColor: '#F7FAF9',
    marginBottom: 14,
  },
  modalItemsScroll: { maxHeight: 260 },
  modalItemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  modalItemInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#DCE6E3',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14.5,
    color: Colors.text,
  },
  modalRowButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  modalRowRemoveButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalSaveShadow: { marginTop: 16, borderRadius: 16, shadowColor: '#0B5A46', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  modalSaveButton: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modalSaveButtonDisabled: { opacity: 0.7 },
  modalSaveButtonText: { color: 'white', fontSize: 16, fontWeight: '900' },
});
