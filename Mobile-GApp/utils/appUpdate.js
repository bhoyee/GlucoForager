import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { API_URL } from '../config/api';
import { apiFetch } from './api';
import { addDebugLog } from './debugLogger';

const STORAGE_KEYS = {
  dismissedVersion: 'app_update_dismissed_version_v1',
};

const getCurrentAppVersion = () =>
  Constants?.expoConfig?.version ||
  Constants?.manifest?.version ||
  '0.0.0';

const parseVersion = (value) => {
  const raw = (value || '').trim();
  if (!raw) return null;
  const parts = raw.split('.').map((item) => Number.parseInt(item, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
};

const compareVersions = (a, b) => {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  if (!av || !bv) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (av[i] > bv[i]) return 1;
    if (av[i] < bv[i]) return -1;
  }
  return 0;
};

export const getDismissedUpdateVersion = async () => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.dismissedVersion);
  } catch {
    return null;
  }
};

export const dismissUpdateForVersion = async (version) => {
  try {
    if (!version) return;
    await AsyncStorage.setItem(STORAGE_KEYS.dismissedVersion, String(version));
  } catch {
    // Ignore.
  }
};

export const fetchUpdateConfig = async () => {
  if (!API_URL) return null;
  try {
    const res = await apiFetch(`${API_URL}/api/app/update`, {}, { timeoutMs: 8000 });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    addDebugLog({
      source: 'Update',
      level: 'warn',
      message: 'Failed to fetch update config.',
      details: `${error?.message || error}`,
    });
    return null;
  }
};

export const checkForAppUpdate = async () => {
  const config = await fetchUpdateConfig();
  if (!config || !config.enabled) return { available: false };

  const currentVersion = String(getCurrentAppVersion());
  const platformKey = Platform.OS === 'ios' ? 'ios' : 'android';
  const platformConfig = config?.[platformKey] || {};
  const latestVersion = platformConfig?.latest_version ? String(platformConfig.latest_version) : null;
  const storeUrl = platformConfig?.store_url ? String(platformConfig.store_url) : null;

  if (!latestVersion || compareVersions(currentVersion, latestVersion) >= 0) {
    return { available: false, currentVersion, latestVersion };
  }

  const dismissed = await getDismissedUpdateVersion();
  if (dismissed && String(dismissed) === String(latestVersion)) {
    return { available: false, currentVersion, latestVersion, dismissed: true };
  }

  return { available: true, currentVersion, latestVersion, storeUrl };
};

export const openStoreForUpdate = async (storeUrl) => {
  const url = (storeUrl || '').trim();
  if (!url) return false;

  try {
    if (Platform.OS === 'android') {
      const match = url.match(/id=([A-Za-z0-9._-]+)/);
      if (match?.[1]) {
        const marketUrl = `market://details?id=${match[1]}`;
        const can = await Linking.canOpenURL(marketUrl);
        if (can) {
          await Linking.openURL(marketUrl);
          return true;
        }
      }
    }

    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
};

