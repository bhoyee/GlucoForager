import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../config/api';
import { apiFetch } from './api';

const getProjectId = () => {
  const direct = Constants?.easConfig?.projectId;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const fromExpoConfig = Constants?.expoConfig?.extra?.eas?.projectId;
  if (typeof fromExpoConfig === 'string' && fromExpoConfig.trim()) return fromExpoConfig.trim();
  return null;
};

export async function registerExpoPushToken() {
  const token = await AsyncStorage.getItem('userToken');
  if (!token) return { ok: false, reason: 'missing_auth' };

  const perms = await Notifications.getPermissionsAsync();
  if (!perms?.granted) return { ok: false, reason: 'permission_denied' };

  let expoToken = null;
  try {
    const projectId = getProjectId();
    const res = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    expoToken = res?.data || null;
  } catch (error) {
    const message = String(error?.message || error || '');
    if (
      message.includes('fcm-credentials') ||
      message.includes('Default FirebaseApp is not initialized') ||
      message.includes('FirebaseApp')
    ) {
      return {
        ok: false,
        reason: 'fcm_not_configured',
        error: message,
      };
    }
    return { ok: false, reason: 'token_error', error: message };
  }

  if (!expoToken) return { ok: false, reason: 'token_missing' };

  const response = await apiFetch(
    `${API_URL}${API_ENDPOINTS.MOBILE_PUSH_TOKENS}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'expo',
        platform: Platform.OS,
        token: expoToken,
        enabled: true,
      }),
    },
    { timeoutMs: 8000 }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return { ok: false, reason: 'server_error', status: response.status, detail: data?.detail };
  }
  return { ok: true };
}

export async function disableExpoPushTokens() {
  const token = await AsyncStorage.getItem('userToken');
  if (!token) return { ok: false, reason: 'missing_auth' };

  const response = await apiFetch(
    `${API_URL}${API_ENDPOINTS.MOBILE_PUSH_TOKENS_DISABLE}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ provider: 'expo' }),
    },
    { timeoutMs: 8000 }
  );
  if (!response.ok) return { ok: false, reason: 'server_error' };
  return { ok: true };
}
