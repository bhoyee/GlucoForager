import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getServiceStatus,
  isServiceDisrupted,
  refreshServiceStatus,
  subscribeServiceStatus,
} from '../utils/serviceStatus';

// While disrupted, re-check this often so the banner clears soon after recovery.
const DISRUPTED_POLL_MS = 60000;

const DEFAULT_MESSAGES = {
  down: "GlucoForager is temporarily unavailable. We're working on it — please try again shortly.",
  maintenance: 'GlucoForager is undergoing scheduled maintenance. Some features may be unavailable.',
};

// App-wide outage banner. Rendered once at the root (above navigation), so it shows on
// the splash, login and in-app screens alike. Its data comes from the Cloudflare status
// Worker, not the API, so it still works when the backend is completely down.
export default function ServiceStatusBanner() {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState(getServiceStatus());
  // Dismissal lasts until the status or message changes (e.g. down -> maintenance).
  const [dismissedKey, setDismissedKey] = useState(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const unsubscribe = subscribeServiceStatus(setStatus);
    refreshServiceStatus({ force: true });

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        refreshServiceStatus({ force: true });
      }
      appState.current = next;
    });

    return () => {
      unsubscribe();
      sub?.remove?.();
    };
  }, []);

  const disrupted = isServiceDisrupted(status);

  useEffect(() => {
    if (!disrupted) return undefined;
    const timer = setInterval(() => refreshServiceStatus({ force: true }), DISRUPTED_POLL_MS);
    return () => clearInterval(timer);
  }, [disrupted]);

  const key = `${status.status}:${status.message || ''}`;
  if (!disrupted || dismissedKey === key) return null;

  const isMaintenance = status.status === 'maintenance';
  const message = status.message || DEFAULT_MESSAGES[status.status];

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingTop: insets.top + 6 }]}>
      <View
        style={[styles.banner, isMaintenance ? styles.maintenance : styles.down]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <Ionicons
          name={isMaintenance ? 'construct-outline' : 'cloud-offline-outline'}
          size={22}
          color={isMaintenance ? '#1E3A8A' : '#7C2D12'}
          style={styles.icon}
        />
        <View style={styles.textCol}>
          <Text style={[styles.title, isMaintenance ? styles.titleMaintenance : styles.titleDown]}>
            {isMaintenance ? 'Scheduled maintenance' : 'Service disruption'}
          </Text>
          <Text style={styles.message}>{message}</Text>
          {!isMaintenance ? (
            <Text style={styles.reassure}>Your data is safe. This message will disappear once we're back.</Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => setDismissedKey(key)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Ionicons name="close" size={20} color="#4B5563" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    zIndex: 1000,
    elevation: 1000,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  down: { backgroundColor: '#FFF7ED', borderColor: '#FDBA74' },
  maintenance: { backgroundColor: '#EFF6FF', borderColor: '#93C5FD' },
  icon: { marginRight: 10, marginTop: 1 },
  textCol: { flex: 1, marginRight: 8 },
  title: { fontSize: 15, fontWeight: '700' },
  titleDown: { color: '#7C2D12' },
  titleMaintenance: { color: '#1E3A8A' },
  message: { marginTop: 3, fontSize: 14, lineHeight: 19, color: '#1F2937' },
  reassure: { marginTop: 4, fontSize: 12.5, lineHeight: 17, color: '#6B7280' },
});
