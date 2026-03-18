import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { useAuth } from '../../context/authContext';
import { apiFetch } from '../../utils/api';

export default function ScanProcessingScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { images, userIsPremium } = route.params || {};
  const { signOut } = useAuth();
  const pollingRef = useRef(null);
  const timeoutRef = useRef(null);
  const elapsedRef = useRef(null);
  const phaseRef = useRef(null);
  const [jobId, setJobId] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [statusLine, setStatusLine] = useState('Preparing…');

  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  useEffect(() => {
    const runAnalysis = async () => {
      if (!images || images.length === 0) {
        Alert.alert('No Images', 'Please select images before analyzing.');
        navigation.goBack();
        return;
      }

      // Start a simple elapsed timer + rotating status line to reduce "it froze" feeling.
      setElapsedSeconds(0);
      setStatusLine(images.length > 1 ? 'Uploading photos…' : 'Uploading photo…');
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      elapsedRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);

      const phases = [
        images.length > 1 ? 'Uploading photos…' : 'Uploading photo…',
        'AI is analyzing ingredients…',
        'Selecting diabetes-friendly recipes…',
        'Finalizing results…',
      ];
      let idx = 0;
      if (phaseRef.current) clearInterval(phaseRef.current);
      phaseRef.current = setInterval(() => {
        idx = (idx + 1) % phases.length;
        setStatusLine(phases[idx]);
      }, 6500);

      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          Alert.alert('Sign in required', 'Please sign in to analyze ingredients.');
          navigation.goBack();
          return;
        }
        const deviceId = await getDeviceId();
        const imagesBase64 = images
          .map((item) => item.base64)
          .filter((value) => Boolean(value));

        if (imagesBase64.length === 0) {
          Alert.alert('Image error', 'Unable to read image data. Please try again.');
          navigation.goBack();
          return;
        }

        const endpoint =
          imagesBase64.length > 1
            ? API_ENDPOINTS.AI_VISION_RECIPES_BATCH_ASYNC
            : API_ENDPOINTS.AI_VISION_RECIPES_ASYNC;
        const response = await apiFetch(
          `${API_URL}${endpoint}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'X-Device-Id': deviceId,
            },
            body:
              imagesBase64.length > 1
                ? JSON.stringify({ images_base64: imagesBase64 })
                : JSON.stringify({ image_base64: imagesBase64[0] }),
          },
          { onUnauthorized: signOut, timeoutMs: 60000 }
        );

        if (response.status === 401) {
          return;
        }

        const data = await response.json();
        if (!response.ok) {
          const detail = data?.detail;
          const message = detail?.message || detail || 'Unable to analyze image.';
          Alert.alert('Scan failed', message);
          navigation.goBack();
          return;
        }

        if (!data?.job_id) {
          Alert.alert('Scan failed', 'Unable to start analysis.');
          navigation.goBack();
          return;
        }

        setJobId(data.job_id);
        await pollJob(data.job_id);
        pollingRef.current = setInterval(() => {
          pollJob(data.job_id);
        }, 3000);
        timeoutRef.current = setTimeout(() => {
          stopPolling();
          Alert.alert(
            'Taking longer than usual',
            'Please try again in a moment.'
          );
          navigation.goBack();
        }, 120000);
      } catch (error) {
        console.warn('Scan analysis error:', error?.message || error);
        Alert.alert('Scan failed', 'Unable to analyze image. Please try again.');
        navigation.goBack();
      }
    };

    runAnalysis();
    return () => stopPolling();
  }, [images, navigation, signOut, userIsPremium]);

  const getDeviceId = async () => {
    const existing = await AsyncStorage.getItem('deviceId');
    if (existing) return existing;
    const generated = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem('deviceId', generated);
    return generated;
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
    if (phaseRef.current) {
      clearInterval(phaseRef.current);
      phaseRef.current = null;
    }
  };

  const pollJob = async (id) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.AI_VISION_RECIPES_ASYNC_STATUS}/${id}`,
        { headers: { Authorization: `Bearer ${token}` } },
        { onUnauthorized: signOut, timeoutMs: 10000 }
      );
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      if (data.status === 'completed') {
        stopPolling();
        const result = data.result || {};
        if (!result?.detected?.length) {
          Alert.alert('Scan failed', 'No food ingredients detected.');
          navigation.goBack();
          return;
        }
        navigation.replace('ScanResults', {
          images,
          userIsPremium,
          detectedIngredients: result.detected || [],
          recipes: result.results || [],
          warning: result.warning || null,
        });
      } else if (data.status === 'failed') {
        stopPolling();
        Alert.alert('Scan failed', data.error || 'Unable to analyze image.');
        navigation.goBack();
      }
    } catch (error) {
      // Ignore polling errors.
    }
  };

  const handleCancel = () => {
    stopPolling();
    navigation.goBack();
  };

  const glow = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.9],
  });

  const formatElapsed = (seconds) => {
    const s = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.iconWrapper, { opacity: glow }]}>
        <Ionicons name="sparkles" size={56} color="white" />
      </Animated.View>
      <Text style={styles.title}>AI Analysis in Progress</Text>
      <Text style={styles.subtitle}>{statusLine}</Text>
      <ActivityIndicator size="large" color="white" style={styles.spinner} />
      <Text style={styles.progressText}>
        Processing {images?.length || 1} image{(images?.length || 1) !== 1 ? 's' : ''}...
      </Text>

      <View style={styles.metaRow}>
        <View style={styles.metaPill}>
          <Ionicons name="time-outline" size={14} color="rgba(255, 255, 255, 0.85)" />
          <Text style={styles.metaText}>Elapsed {formatElapsed(elapsedSeconds)}</Text>
        </View>
        <View style={styles.metaPill}>
          <Ionicons name="shield-checkmark-outline" size={14} color="rgba(255, 255, 255, 0.85)" />
          <Text style={styles.metaText}>Usually under 1 minute</Text>
        </View>
      </View>

      <Text style={styles.helperText}>
        If this takes longer than expected, your connection may be slow. You can cancel and try again.
      </Text>

      <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1F14',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: Colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  spinner: {
    marginBottom: 16,
  },
  progressText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  metaRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    marginHorizontal: 6,
    marginTop: 8,
  },
  metaText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  helperText: {
    marginTop: 12,
    maxWidth: 320,
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.70)',
    lineHeight: 16,
  },
  cancelButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  cancelText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});
