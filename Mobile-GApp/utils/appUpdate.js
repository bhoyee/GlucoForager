import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { API_URL } from '../config/api';
import { apiFetch } from './api';
import { addDebugLog } from './debugLogger';

const STORAGE_KEYS = {
  dismissedVersion: 'app_update_dismissed_version_v1',
};

const debugLog = (message, details) => {
  if (!__DEV__) return;
  try {
    // eslint-disable-next-line no-console
    console.log(`[AppUpdate] ${message}`, details || '');
  } catch {
    // Ignore.
  }
  try {
    addDebugLog({
      source: 'AppUpdate',
      level: 'info',
      message,
      details: details ? JSON.stringify(details) : undefined,
    });
  } catch {
    // Ignore.
  }
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
    debugLog('Fetching update config', { url: `${API_URL}/api/app/update` });
    const res = await apiFetch(`${API_URL}/api/app/update`, {}, { timeoutMs: 8000 });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      debugLog('Update config request failed', { status: res.status, detail: data?.detail });
      return null;
    }
    const data = await res.json();
    debugLog('Update config loaded', data);
    return data;
  } catch (error) {
    addDebugLog({
      source: 'Update',
      level: 'warn',
      message: 'Failed to fetch update config.',
      details: `${error?.message || error}`,
    });
    debugLog('Update config fetch threw', { error: `${error?.message || error}` });
    return null;
  }
};

export const checkForAppUpdate = async () => {
  const config = await fetchUpdateConfig();
  if (!config) {
    debugLog('No update config, skipping');
    return { available: false };
  }
  if (!config.enabled) {
    debugLog('Update prompt disabled, skipping');
    return { available: false };
  }

  const currentVersion = String(getCurrentAppVersion());
  const platformKey = Platform.OS === 'ios' ? 'ios' : 'android';
  const platformConfig = config?.[platformKey] || {};
  const latestVersion = platformConfig?.latest_version ? String(platformConfig.latest_version) : null;
  const storeUrl = platformConfig?.store_url ? String(platformConfig.store_url) : null;

  debugLog('Version check', { platform: platformKey, currentVersion, latestVersion, storeUrl });

  if (!latestVersion || compareVersions(currentVersion, latestVersion) >= 0) {
    debugLog('No update available', { currentVersion, latestVersion });
    return { available: false, currentVersion, latestVersion };
  }

  const dismissed = await getDismissedUpdateVersion();
  if (dismissed && String(dismissed) === String(latestVersion)) {
    debugLog('Update dismissed for latest version', { latestVersion });
    return { available: false, currentVersion, latestVersion, dismissed: true };
  }

  debugLog('Update available', { currentVersion, latestVersion });
  return { available: true, currentVersion, latestVersion, storeUrl };
};

export const openStoreForUpdate = async (storeUrl) => {
  const url = (storeUrl || '').trim();
  if (!url) {
    debugLog('Open store skipped (no url)');
    return false;
  }

  try {
    if (Platform.OS === 'android') {
      const match = url.match(/id=([A-Za-z0-9._-]+)/);
      if (match?.[1]) {
        const marketUrl = `market://details?id=${match[1]}`;
        const can = await Linking.canOpenURL(marketUrl);
        if (can) {
          await Linking.openURL(marketUrl);
          debugLog('Opened Play Store via market://', { marketUrl });
          return true;
        }
      }
    }

    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) return false;
    await Linking.openURL(url);
    debugLog('Opened store url', { url });
    return true;
  } catch {
    debugLog('Open store failed');
    return false;
  }
};
