import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { useSubscription } from './SubscriptionContext';

const FavoritesContext = createContext(null);
const STORAGE_KEY = '@glucoforager:favorites';

export const FavoritesProvider = ({ children }) => {
  const [favorites, setFavorites] = useState([]);
  const { isPremium } = useSubscription();

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          setFavorites(JSON.parse(raw));
        }
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  const persist = async (items) => {
    setFavorites(items);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      // ignore
    }
  };

  const addFavorite = (recipe) => {
    if (!isPremium) {
      Alert.alert('Premium only', 'Favorites require a premium subscription.');
      return;
    }
    const exists = favorites.find((r) => r.title === recipe.title);
    if (exists) return;
    persist([...favorites, recipe]);
  };

  const removeFavorite = (title) => {
    const updated = favorites.filter((r) => r.title !== title);
    persist(updated);
  };

  const isFavorite = (title) => favorites.some((r) => r.title === title);

  return (
    <FavoritesContext.Provider value={{ favorites, addFavorite, removeFavorite, isFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => useContext(FavoritesContext);
