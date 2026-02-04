import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { API_URL } from '../config/api';
import { apiFetch } from './api';
import { addDebugLog, getDebugLogs, subscribeDebugLogs } from './debugLogger';

let uploadTimer = null;
let isUploading = false;
let lastSentIndex = 0;

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
  if (!logs.length || lastSentIndex >= logs.length) return;

  isUploading = true;
  try {
    const token = await AsyncStorage.getItem('userToken');
    const pending = logs.slice(0, logs.length - lastSentIndex).reverse();
    const response = await apiFetch(
      `${API_URL}/api/mobile/logs`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(buildPayload(pending)),
      },
      { timeoutMs: 10000 }
    );
    if (response.ok) {
      lastSentIndex = logs.length;
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
