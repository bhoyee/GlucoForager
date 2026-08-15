// screens/main/ShoppingListScreen.js
import React, { useCallback, useEffect, useState } from 'react';
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
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../context/authContext';

const checkedStorageKey = (listId) => `shopping_checked_${listId}`;

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
  const [isAddingItemToListId, setIsAddingItemToListId] = useState(null);

  const loadCheckedState = async (listId) => {
    try {
      const raw = await AsyncStorage.getItem(checkedStorageKey(listId));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
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

      const checkedEntries = await Promise.all(
        items.map(async (item) => [item.id, await loadCheckedState(item.id)])
      );
      setCheckedByListId(Object.fromEntries(checkedEntries));
    } catch (error) {
      Alert.alert('Error', 'Unable to load shopping lists right now.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [signOut]);

  useEffect(() => {
    if (isFocused) {
      setIsLoading(true);
      loadLists();
    }
  }, [isFocused, loadLists]);

  const onRefresh = () => {
    setRefreshing(true);
    loadLists();
  };

  const toggleExpanded = (listId) => {
    setExpandedId((prev) => (prev === listId ? null : listId));
  };

  const toggleItemChecked = async (listId, index) => {
    const current = checkedByListId[listId] || [];
    const next = current.includes(index)
      ? current.filter((i) => i !== index)
      : [...current, index];
    setCheckedByListId((prev) => ({ ...prev, [listId]: next }));
    try {
      await AsyncStorage.setItem(checkedStorageKey(listId), JSON.stringify(next));
    } catch {
      // Ignore storage errors - checked state just won't persist across sessions.
    }
  };

  const deleteList = (listId, title) => {
    Alert.alert(
      'Delete shopping list',
      `Remove "${title}"? This can't be undone.`,
      [
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
      ]
    );
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
      if (data?.id) {
        setExpandedId(data.id);
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to save this list right now.');
    } finally {
      setIsSavingNewList(false);
    }
  };

  const addItemToList = async (listId) => {
    const text = (newItemTextByListId[listId] || '').trim();
    if (!text || isAddingItemToListId === listId) return;
    const list = lists.find((l) => l.id === listId);
    if (!list) return;
    const existingItems = Array.isArray(list.items) ? list.items : [];
    const nextItems = [...existingItems, text];
    try {
      setIsAddingItemToListId(listId);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.SHOPPING_LIST}/${listId}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: nextItems }),
        },
        { onUnauthorized: signOut }
      );
      if (!response.ok) {
        Alert.alert('Error', 'Unable to add this item right now.');
        return;
      }
      setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, items: nextItems } : l)));
      setNewItemTextByListId((prev) => ({ ...prev, [listId]: '' }));
    } catch (error) {
      Alert.alert('Error', 'Unable to add this item right now.');
    } finally {
      setIsAddingItemToListId(null);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading shopping lists...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentBottomPadding }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
      >
        <View style={[styles.headerPanel, { paddingTop: headerPaddingTop }]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={22} color="white" />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Shopping Lists</Text>
              <Text style={styles.headerSubtitle}>
                {lists.length ? `${lists.length} saved` : 'No lists yet'}
              </Text>
            </View>
            <TouchableOpacity style={styles.backButton} onPress={openCreateModal}>
              <Ionicons name="add" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.content}>
          {lists.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="cart-outline" size={90} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>No shopping lists yet</Text>
              <Text style={styles.emptySubtitle}>
                Open a recipe and tap "Add to shopping list", or tap + above to start one
                yourself.
              </Text>
              <TouchableOpacity style={styles.emptyCreateButton} onPress={openCreateModal}>
                <Ionicons name="add" size={18} color="white" />
                <Text style={styles.emptyCreateButtonText}>New list</Text>
              </TouchableOpacity>
            </View>
          ) : (
            lists.map((list) => {
              const items = Array.isArray(list.items) ? list.items : [];
              const checked = checkedByListId[list.id] || [];
              const expanded = expandedId === list.id;
              return (
                <View key={list.id} style={styles.listCard}>
                  <TouchableOpacity
                    style={styles.listHeader}
                    onPress={() => toggleExpanded(list.id)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.listHeaderIcon}>
                      <Ionicons name="cart-outline" size={20} color={Colors.primary} />
                    </View>
                    <View style={styles.listHeaderText}>
                      <Text style={styles.listTitle} numberOfLines={1}>
                        {list.title}
                      </Text>
                      <Text style={styles.listMeta}>
                        {checked.length}/{items.length} checked
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deleteList(list.id, list.title)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.textLight} />
                    </TouchableOpacity>
                    <Ionicons
                      name={expanded ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={Colors.textLight}
                    />
                  </TouchableOpacity>

                  {expanded ? (
                    <View style={styles.itemsList}>
                      {items.length === 0 ? (
                        <Text style={styles.emptyItemsText}>No items in this list.</Text>
                      ) : (
                        items.map((item, index) => {
                          const isChecked = checked.includes(index);
                          return (
                            <TouchableOpacity
                              key={`${list.id}-${index}`}
                              style={styles.itemRow}
                              onPress={() => toggleItemChecked(list.id, index)}
                              activeOpacity={0.7}
                            >
                              <Ionicons
                                name={isChecked ? 'checkmark-circle' : 'ellipse-outline'}
                                size={22}
                                color={isChecked ? Colors.primary : Colors.textLight}
                              />
                              <Text
                                style={[styles.itemText, isChecked && styles.itemTextChecked]}
                                numberOfLines={1}
                              >
                                {typeof item === 'string' ? item : item?.name || 'Item'}
                              </Text>
                            </TouchableOpacity>
                          );
                        })
                      )}
                      <View style={styles.addItemRow}>
                        <TextInput
                          style={styles.addItemInput}
                          placeholder="Add an item..."
                          placeholderTextColor={Colors.textMuted}
                          value={newItemTextByListId[list.id] || ''}
                          onChangeText={(text) =>
                            setNewItemTextByListId((prev) => ({ ...prev, [list.id]: text }))
                          }
                          onSubmitEditing={() => addItemToList(list.id)}
                          returnKeyType="done"
                        />
                        <TouchableOpacity
                          style={styles.addItemButton}
                          onPress={() => addItemToList(list.id)}
                          disabled={isAddingItemToListId === list.id}
                        >
                          <Ionicons name="add" size={18} color="white" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={closeCreateModal}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 12) + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New shopping list</Text>
              <TouchableOpacity onPress={closeCreateModal} disabled={isSavingNewList}>
                <Ionicons name="close" size={24} color={Colors.text} />
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
                    editable={!isSavingNewList}
                  />
                  {index === newListItems.length - 1 ? (
                    <TouchableOpacity
                      style={styles.modalRowButton}
                      onPress={addNewListItemRow}
                      disabled={isSavingNewList}
                    >
                      <Ionicons name="add" size={18} color="white" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.modalRowRemoveButton}
                      onPress={() => removeNewListItemRow(index)}
                      disabled={isSavingNewList}
                    >
                      <Ionicons name="close-circle" size={22} color={Colors.textLight} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalSaveButton, isSavingNewList && styles.modalSaveButtonDisabled]}
              onPress={saveNewList}
              disabled={isSavingNewList}
            >
              {isSavingNewList ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.modalSaveButtonText}>Save list</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: { marginTop: 12, fontSize: 16, color: Colors.textLight },
  headerPanel: {
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
  headerText: { flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 21, fontWeight: '900', color: 'white' },
  headerSubtitle: { marginTop: 2, fontSize: 13, color: 'rgba(255,255,255,0.78)', fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingTop: 18 },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textLight,
    textAlign: 'center',
    lineHeight: 20,
  },
  listCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  listHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: `${Colors.primary}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listHeaderText: { flex: 1, minWidth: 0 },
  listTitle: { fontSize: 15, fontWeight: '800', color: Colors.text },
  listMeta: { marginTop: 2, fontSize: 12, color: Colors.textLight, fontWeight: '600' },
  deleteButton: { padding: 4 },
  itemsList: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  emptyItemsText: {
    marginTop: 12,
    fontSize: 13,
    color: Colors.textLight,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  itemText: { flex: 1, fontSize: 14, color: Colors.text, fontWeight: '600' },
  itemTextChecked: {
    color: Colors.textLight,
    textDecorationLine: 'line-through',
  },
  emptyCreateButton: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.primary,
  },
  emptyCreateButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
  },
  addItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  addItemInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  addItemButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 29, 24, 0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 19, fontWeight: '800', color: Colors.text },
  modalTitleInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
    marginBottom: 16,
  },
  modalItemsScroll: {
    maxHeight: 260,
  },
  modalItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  modalItemInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
  },
  modalRowButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalRowRemoveButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveButton: {
    marginTop: 16,
    height: 50,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveButtonDisabled: {
    opacity: 0.7,
  },
  modalSaveButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '800',
  },
});
