import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Share, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Colors } from '../../constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../../config/api';
import { apiFetch } from '../../utils/api';
import { clearDebugLogs, getDebugLogs, subscribeDebugLogs } from '../../utils/debugLogger';
import { devInspectScheduledNotifications, devSendTestDailyGuidanceNotification } from '../../utils/mealReminders';

export default function DebugLogsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState(() => getDebugLogs());
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeDebugLogs(() => {
      setLogs(getDebugLogs());
    });
    return unsubscribe;
  }, []);

  const logText = useMemo(() => {
    return logs
      .map((entry) => {
        const level = entry.level ? `[${entry.level.toUpperCase()}] ` : '';
        const source = entry.source ? `${entry.source}: ` : '';
        const details = entry.details ? ` | ${entry.details}` : '';
        return `${entry.timestamp} ${level}${source}${entry.message}${details}`;
      })
      .join('\n');
  }, [logs]);

  const handleShare = async () => {
    if (!logText) return;
    await Share.share({ message: logText });
  };

  const handleSend = async () => {
    if (!logs.length) {
      Alert.alert('No logs', 'There are no logs to send yet.');
      return;
    }
    setIsSending(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await apiFetch(
        `${API_URL}/api/mobile/logs`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            events: logs.map((entry) => ({
              timestamp: entry.timestamp,
              level: entry.level,
              source: entry.source,
              message: entry.message,
              details: entry.details,
            })),
            app_version:
              Constants?.expoConfig?.version ||
              Constants?.manifest?.version ||
              'unknown',
            device: Constants?.deviceName || null,
          }),
        },
        {}
      );
      if (!response.ok) {
        Alert.alert('Failed', 'Unable to send logs right now.');
        return;
      }
      Alert.alert('Sent', 'Logs sent successfully.');
    } catch (error) {
      Alert.alert('Failed', 'Unable to send logs right now.');
    } finally {
      setIsSending(false);
    }
  };

  const handleTestDailyGuidance = async () => {
    try {
      await devSendTestDailyGuidanceNotification();
      await devInspectScheduledNotifications();
      Alert.alert('Scheduled', 'A test Daily Guidance notification should appear in ~2 seconds.');
    } catch {
      Alert.alert('Failed', 'Unable to schedule a test notification.');
    }
  };

  const handleClose = () => {
    if (navigation?.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('ProfileMain');
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={handleClose}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Debug Logs</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleClose}>
            <Ionicons name="close" size={20} color={Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleSend} disabled={isSending}>
            {isSending ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <Ionicons name="cloud-upload-outline" size={20} color={Colors.text} />
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleShare} disabled={!logText}>
            <Ionicons name="share-social-outline" size={20} color={logText ? Colors.text : Colors.textLight} />
          </TouchableOpacity>
          {__DEV__ ? (
            <TouchableOpacity style={styles.actionButton} onPress={handleTestDailyGuidance}>
              <Ionicons name="notifications-outline" size={20} color={Colors.text} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => clearDebugLogs()}
            disabled={!logs.length}
          >
            <Ionicons name="trash-outline" size={20} color={logs.length ? Colors.text : Colors.textLight} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {logs.length === 0 ? (
          <Text style={styles.emptyText}>No logs yet.</Text>
        ) : (
          logs.map((entry, index) => (
            <View key={`${entry.timestamp}-${index}`} style={styles.logRow}>
              <Text style={styles.logTimestamp}>{entry.timestamp}</Text>
              <Text style={styles.logMessage}>
                {entry.level ? `[${entry.level.toUpperCase()}] ` : ''}
                {entry.source ? `${entry.source}: ` : ''}
                {entry.message}
              </Text>
              {entry.details ? <Text style={styles.logDetails}>{entry.details}</Text> : null}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    marginLeft: 12,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emptyText: {
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: 24,
  },
  logRow: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  logTimestamp: {
    fontSize: 10,
    color: Colors.textLight,
    marginBottom: 6,
  },
  logMessage: {
    fontSize: 13,
    color: Colors.text,
    marginBottom: 4,
  },
  logDetails: {
    fontSize: 12,
    color: Colors.textLight,
  },
});
