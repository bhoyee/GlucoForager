// context/authContext.js - UPDATED
import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureRevenueCat } from '../utils/revenuecat';
import { API_ENDPOINTS, API_URL } from '../config/api';
import { apiFetch, setAuthRefreshHandler } from '../utils/api';

// Create the context
const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [userToken, setUserToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [foodProfileCompleted, setFoodProfileCompleted] = useState(null); // true | false | null
  const [needsFoodProfileOnboarding, setNeedsFoodProfileOnboarding] = useState(false);

  const devLog = (...args) => {
    if (!__DEV__) return;
    // eslint-disable-next-line no-console
    console.log(...args);
  };

  useEffect(() => {
    // Check auth status on app start
    setAuthRefreshHandler(refreshAccessToken);
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      // Check if user has completed onboarding
      const onboarded = await AsyncStorage.getItem('hasCompletedOnboarding');
      // Check login status
      const token = await AsyncStorage.getItem('userToken');
      const publicId = await AsyncStorage.getItem('publicUserId');
      
      devLog('Auth check:', { onboarded, hasToken: Boolean(token) });
      
      setHasCompletedOnboarding(onboarded === 'true');
      if (token) {
        const isValid = await validateToken(token);
        if (isValid) {
          let resolvedPublicId = publicId;
          let resolvedEmail = null;
          let resolvedName = null;

          // Fetch profile BEFORE setting `userToken` so RootNavigator can route correctly on first render.
          const profile = await fetchProfile(token);
          if (!resolvedPublicId && profile?.public_id) {
            resolvedPublicId = profile.public_id;
            await AsyncStorage.setItem('publicUserId', profile.public_id);
          }
          resolvedEmail = profile?.email || null;
          resolvedName = profile?.full_name || null;
          const completed = profile?.profile_completed;
          setFoodProfileCompleted(completed === true ? true : completed === false ? false : null);
          setNeedsFoodProfileOnboarding(completed === false);

          setUserToken(token);
          await configureRevenueCat({
            token,
            publicId: resolvedPublicId,
            email: resolvedEmail,
            fullName: resolvedName,
          });
        } else {
          await clearAuthState();
        }
      } else {
        await clearAuthState();
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const clearAuthState = async () => {
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('refreshToken');
    await AsyncStorage.removeItem('publicUserId');
    setUserToken(null);
    setFoodProfileCompleted(null);
    setNeedsFoodProfileOnboarding(false);
    await configureRevenueCat({});
  };

  const refreshAccessToken = async () => {
    try {
      const refreshToken = await AsyncStorage.getItem('refreshToken');
      if (!refreshToken) return null;
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.REFRESH}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        }
      );
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      if (!data?.access_token) return null;
      await AsyncStorage.setItem('userToken', data.access_token);
      if (data.refresh_token) {
        await AsyncStorage.setItem('refreshToken', data.refresh_token);
      }
      // Prefer hint from refresh response; fall back to fetching profile.
      if (data.profile_completed === true || data.profile_completed === false) {
        setFoodProfileCompleted(data.profile_completed);
        setNeedsFoodProfileOnboarding(data.profile_completed === false);
      } else {
        const profile = await fetchProfile(data.access_token);
        const completed = profile?.profile_completed;
        setFoodProfileCompleted(completed === true ? true : completed === false ? false : null);
        setNeedsFoodProfileOnboarding(completed === false);
      }
      setUserToken(data.access_token);
      return data.access_token;
    } catch (error) {
      return null;
    }
  };

  const validateToken = async (token) => {
    try {
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.USER_PROFILE}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.status === 401) {
        const refreshed = await refreshAccessToken();
        return Boolean(refreshed);
      }
      return response.ok;
    } catch (error) {
      // If network is down, keep the token and retry later.
      return true;
    }
  };

  const fetchProfile = async (token) => {
    try {
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.USER_PROFILE}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      return null;
    }
  };

  const signIn = async (token, publicId, refreshToken, profileCompletedHint) => {
    try {
      await AsyncStorage.setItem('userToken', token);
      if (refreshToken) {
        await AsyncStorage.setItem('refreshToken', refreshToken);
      }
      if (publicId) {
        await AsyncStorage.setItem('publicUserId', publicId);
      }

      // Use auth response hint when available to avoid timing/routing issues on first login.
      if (profileCompletedHint === true || profileCompletedHint === false) {
        setFoodProfileCompleted(profileCompletedHint);
        setNeedsFoodProfileOnboarding(profileCompletedHint === false);
      }

      // Fetch profile BEFORE setting `userToken` (best-effort) so RootNavigator can route correctly.
      const profile = await fetchProfile(token);
      if (profile) {
        const completed = profile?.profile_completed;
        setFoodProfileCompleted(completed === true ? true : completed === false ? false : null);
        setNeedsFoodProfileOnboarding(completed === false);
      }
      setUserToken(token);
      await configureRevenueCat({
        token,
        publicId,
        email: profile?.email || null,
        fullName: profile?.full_name || null,
      });
      devLog('User signed in');
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      const refreshToken = await AsyncStorage.getItem('refreshToken');
      if (refreshToken) {
        await apiFetch(
          `${API_URL}${API_ENDPOINTS.LOGOUT}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          }
        );
      }
      await AsyncStorage.removeItem('userToken');
      await AsyncStorage.removeItem('refreshToken');
      await AsyncStorage.removeItem('publicUserId');
      setUserToken(null);
      setFoodProfileCompleted(null);
      setNeedsFoodProfileOnboarding(false);
      await configureRevenueCat({});
      devLog('User signed out');
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const completeFoodProfileOnboarding = async () => {
    setFoodProfileCompleted(true);
    setNeedsFoodProfileOnboarding(false);
  };

  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
      setHasCompletedOnboarding(true);
      devLog('Onboarding completed');
    } catch (error) {
      console.error('Error completing onboarding:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        userToken,
        isLoading,
        hasCompletedOnboarding,
        foodProfileCompleted,
        needsFoodProfileOnboarding,
        signIn,
        signOut,
        completeOnboarding,
        completeFoodProfileOnboarding,
        checkAuthStatus,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

// Create hook for easy context usage
export const useAuth = () => useContext(AuthContext);

// Also export the context directly for useContext
export { AuthContext };
