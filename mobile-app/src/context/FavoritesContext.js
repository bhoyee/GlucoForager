import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { useSubscription } from './SubscriptionContext';
import { useAuth } from './AuthContext';
import { listFavorites, saveFavorite } from '../services/api';

const FavoritesContext = createContext(null);
const STORAGE_KEY = '@glucoforager:favorites';

export const FavoritesProvider = ({ children }) => {
  const [favorites, setFavorites] = useState([]);
  const { isPremium } = useSubscription();
  const { token } = useAuth();

  useEffect(() => {
    (async () => {
      try {
        if (token) {
          const res = await listFavorites(token);
          if (res.items) {
            setFavorites(res.items.map((i) => ({ title: i.title, ...i.recipe })));
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(res.items.map((i) => ({ title: i.title, ...i.recipe }))));
            return;
          }
        }
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          setFavorites(JSON.parse(raw));
        }
      } catch (e) {
        // ignore
      }
    })();
  }, [token]);

  const persistLocal = async (items) => {
    setFavorites(items);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      // ignore
    }
  };

  const addFavorite = async (recipe) => {
    if (!isPremium) {
      Alert.alert('Premium only', 'Favorites require a premium subscription.');
      return;
    }
    const exists = favorites.find((r) => r.title === recipe.title);
    if (exists) return;
    const updated = [...favorites, recipe];
    if (token) {
      await saveFavorite(recipe.title, recipe, token);
    }
    persistLocal(updated);
  };

  const removeFavorite = (title) => {
    const updated = favorites.filter((r) => r.title !== title);
    persistLocal(updated);
    // Backend removal endpoint not implemented; skip for now.
  };

  const isFavorite = (title) => favorites.some((r) => r.title === title);

  return (
    <FavoritesContext.Provider value={{ favorites, addFavorite, removeFavorite, isFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => useContext(FavoritesContext);
