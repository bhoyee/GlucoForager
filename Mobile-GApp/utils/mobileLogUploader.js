import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { API_URL } from '../config/api';
import { apiFetch } from './api';
import { addDebugLog, getDebugLogs, subscribeDebugLogs } from './debugLogger';

let uploadTimer = null;
let isUploading = false;
let lastSentAt = null;

const getAppVersion = () =>
  Constants?.expoConfig?.version ||
  Constants?.manifest?.version ||
  'unknown';

const buildPayload = (logs) => ({
  events: logs.map((entry) => ({
    timestamp: entry.timestamp,
    level: entry.level,
    source: entry.source,
    message: entry.message,
    details: entry.details,
  })),
  app_version: getAppVersion(),
  device: Constants?.deviceName || null,
});

const sendLogs = async () => {
  if (isUploading || !API_URL) return;
  const logs = getDebugLogs();
  if (!logs.length) return;

  const pending = logs.filter((entry) => {
    if (!lastSentAt) return true;
    const entryTime = Date.parse(entry.timestamp || '');
    const lastTime = Date.parse(lastSentAt);
    if (Number.isNaN(entryTime) || Number.isNaN(lastTime)) return true;
    return entryTime > lastTime;
  });
  if (!pending.length) return;

  isUploading = true;
  try {
    const token = await AsyncStorage.getItem('userToken');
    const ordered = [...pending].sort((a, b) => {
      const aTime = Date.parse(a.timestamp || '');
      const bTime = Date.parse(b.timestamp || '');
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0;
      return aTime - bTime;
    });
    const response = await apiFetch(
      `${API_URL}/api/mobile/logs`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(buildPayload(ordered)),
      },
      { timeoutMs: 10000 }
    );
    if (response.ok) {
      const newest = ordered[ordered.length - 1];
      if (newest?.timestamp) {
        lastSentAt = newest.timestamp;
      }
    }
  } catch (error) {
    addDebugLog({
      source: 'Logger',
      level: 'warn',
      message: 'Auto log upload failed.',
      details: `${error?.message || error}`,
    });
  } finally {
    isUploading = false;
  }
};

export const startMobileLogUploader = () => {
  if (uploadTimer) return;
  const unsubscribe = subscribeDebugLogs(() => {
    void sendLogs();
  });
  uploadTimer = setInterval(() => {
    void sendLogs();
  }, 30000);
  return () => {
    unsubscribe?.();
    clearInterval(uploadTimer);
    uploadTimer = null;
  };
};
