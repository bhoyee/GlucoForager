import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Animated,
  Easing,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { useAuth } from '../../context/authContext';
import { apiFetch } from '../../utils/api';
import { addDebugLog } from '../../utils/debugLogger';
import * as ImageManipulator from 'expo-image-manipulator';

const LAST_INGREDIENTS_KEY = 'last_used_ingredients_v1';

export default function ScanProcessingScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { images, userIsPremium } = route.params || {};
  const { signOut } = useAuth();
  const pollingRef = useRef(null);
  const timeoutRef = useRef(null);
  const phaseRef = useRef(null);
  const [jobId, setJobId] = useState(null);
  const [statusLine, setStatusLine] = useState('Preparing your scan...');
  const [phaseIndex, setPhaseIndex] = useState(0);

  const pulse = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    const sweepAnimation = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1900,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    pulseAnimation.start();
    sweepAnimation.start();
    return () => {
      pulseAnimation.stop();
      sweepAnimation.stop();
    };
  }, [pulse, sweep]);

  useEffect(() => {
    const runAnalysis = async () => {
      if (!images || images.length === 0) {
        Alert.alert('No Images', 'Please select images before analyzing.');
        navigation.goBack();
        return;
      }

      const phases = [
        images.length > 1 ? 'Preparing your photos' : 'Preparing your photo',
        images.length > 1 ? 'Uploading your pantry scan' : 'Uploading your fridge scan',
        'Detecting food items',
        'Checking diabetes suitability',
        'Building your ingredient list',
      ];
      let idx = 0;
      setPhaseIndex(idx);
      setStatusLine(phases[idx]);
      if (phaseRef.current) clearInterval(phaseRef.current);
      phaseRef.current = setInterval(() => {
        idx = (idx + 1) % phases.length;
        setPhaseIndex(idx);
        setStatusLine(phases[idx]);
      }, 5200);

      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          Alert.alert('Sign in required', 'Please sign in to analyze ingredients.');
          navigation.goBack();
          return;
        }
        const deviceId = await getDeviceId();

        // Keep payload sizes aggressively small to reduce "Network request failed" on slow links.
        // Notes:
        // - We upload base64 in JSON (adds overhead). Smaller JPEGs dramatically reduce timeouts.
        // - Ingredient detection works well at lower resolutions; we don't need large photos here.
        const sources = Array.isArray(images) ? images.slice(0, 5) : [];
        const targetWidth = sources.length > 2 ? 640 : 768;
        const jpegCompress = sources.length > 2 ? 0.45 : 0.5;

        const toCompressedBase64 = async (uri) => {
          if (!uri) return null;
          try {
            const result = await ImageManipulator.manipulateAsync(
              uri,
              [{ resize: { width: targetWidth } }],
              { compress: jpegCompress, format: ImageManipulator.SaveFormat.JPEG, base64: true }
            );
            return result?.base64 || null;
          } catch {
            return null;
          }
        };

        // Cap how many photos we process to keep requests bounded (and prevent huge payloads).
        // Users can still scan again if they want to add more.
        if (Array.isArray(images) && images.length > 5) {
          setStatusLine('Optimizing first 5 photos...');
        }

        // Limit CPU load on low-end devices: compress a couple at a time.
        const concurrency = 2;
        const imagesBase64 = [];
        for (let i = 0; i < sources.length; i += concurrency) {
          const batch = sources.slice(i, i + concurrency);
          const results = await Promise.all(
            batch.map(async (item) => {
              const direct = typeof item?.base64 === 'string' && item.base64.trim() ? item.base64.trim() : null;
              if (direct) return direct;
              return await toCompressedBase64(item?.uri);
            })
          );
          results.forEach((b64) => {
            if (typeof b64 === 'string' && b64.trim()) imagesBase64.push(b64.trim());
          });
        }

        if (imagesBase64.length === 0) {
          Alert.alert('Image error', 'Unable to read image data. Please try again.');
          navigation.goBack();
          return;
        }

        const endpoint =
          imagesBase64.length > 1
            ? API_ENDPOINTS.AI_VISION_RECIPES_BATCH_ASYNC
            : API_ENDPOINTS.AI_VISION_RECIPES_ASYNC;

        // Starting the async job should be fast, but on slow networks the upload itself can take time.
        // Give extra headroom so we don't abort mid-upload.
        const startTimeoutMs =
          imagesBase64.length <= 1 ? 180000 : imagesBase64.length <= 2 ? 240000 : 300000;
        addDebugLog({
          source: 'AI',
          level: 'info',
          message: 'Starting scan analysis',
          details: JSON.stringify({
            endpoint,
            images_count: imagesBase64.length,
            timeout_ms: startTimeoutMs,
          }),
        });
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
                ? JSON.stringify({ images_base64: imagesBase64, include_recipes: false })
                : JSON.stringify({ image_base64: imagesBase64[0], include_recipes: false }),
          },
          { onUnauthorized: signOut, timeoutMs: startTimeoutMs }
        );

        if (response.status === 401) {
          return;
        }

        const data = await response.json();
        if (!response.ok) {
          const detail = data?.detail;
          const message = detail?.message || detail || 'Unable to analyze image.';
          addDebugLog({
            source: 'AI',
            level: 'warn',
            message: 'Scan analysis start failed',
            details: JSON.stringify({ endpoint, status: response.status, message }),
          });
          Alert.alert('Scan failed', message);
          navigation.goBack();
          return;
        }

        if (!data?.job_id) {
          addDebugLog({
            source: 'AI',
            level: 'warn',
            message: 'Scan analysis missing job_id',
            details: JSON.stringify({ endpoint, status: response.status }),
          });
          Alert.alert('Scan failed', 'Unable to start analysis.');
          navigation.goBack();
          return;
        }

        addDebugLog({
          source: 'AI',
          level: 'info',
          message: 'Scan analysis job started',
          details: JSON.stringify({ job_id: data.job_id }),
        });
        setJobId(data.job_id);
        await pollJob(data.job_id);
        pollingRef.current = setInterval(() => {
          pollJob(data.job_id);
        }, 3000);
        const count = imagesBase64.length || (images?.length || 1);
        // Backend work (vision -> ingredients) can occasionally be slow under load; don't hard-fail too early.
        const overallTimeoutMs = count <= 2 ? 240000 : count <= 4 ? 360000 : 480000;
        timeoutRef.current = setTimeout(() => {
          stopPolling();
          Alert.alert(
            'Taking longer than usual',
            'Please try again in a moment.'
          );
          navigation.goBack();
        }, overallTimeoutMs);
      } catch (error) {
        console.warn('Scan analysis error:', error?.message || error);
        if (error?.name === 'AbortError') {
          Alert.alert(
            'Scan failed',
            'Upload timed out. Please try again on a stronger connection or scan fewer photos.'
          );
        } else {
          Alert.alert('Scan failed', 'Unable to analyze image. Please try again.');
        }
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
        addDebugLog({
          source: 'AI',
          level: 'info',
          message: 'Scan vision job completed',
          details: JSON.stringify({
            job_id: id,
            detected_count: Array.isArray(data?.result?.detected) ? data.result.detected.length : 0,
          }),
        });
        stopPolling();
        const result = data.result || {};
        const detectedAll = Array.isArray(result.detected_all) ? result.detected_all : [];
        const detectedSelected = Array.isArray(result.detected) ? result.detected : [];
        if (!detectedAll.length && !detectedSelected.length) {
          Alert.alert('Scan failed', 'No food ingredients detected.');
          navigation.goBack();
          return;
        }

        // Persist latest scan-selected ingredients for "Eat now" reuse.
        // Use the backend-selected list (safe ingredients used for recipes), not the full detected list.
        try {
          const rawList = detectedSelected;
          const seen = new Set();
          const normalizedUnique = [];
          for (const raw of rawList) {
            const name = String(raw || '').trim().replace(/\s+/g, ' ');
            if (!name) continue;
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            normalizedUnique.push(name);
            if (normalizedUnique.length >= 20) break;
          }
          await AsyncStorage.setItem(LAST_INGREDIENTS_KEY, JSON.stringify(normalizedUnique));
        } catch {
          // Ignore.
        }

        navigation.replace('ScanResults', {
          images,
          userIsPremium,
          detectedIngredients: detectedAll.length ? detectedAll : detectedSelected,
          detectedIngredientsSelected: detectedSelected,
          recipes: result.results || [],
          warning: result.warning || null,
        });
      } else if (data.status === 'failed') {
        addDebugLog({
          source: 'AI',
          level: 'warn',
          message: 'Scan vision job failed',
          details: JSON.stringify({ job_id: id, error: data?.error || null }),
        });
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
    outputRange: [0.35, 1],
  });

  const iconScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.98, 1.05],
  });

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.16],
  });

  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.28, 0.04],
  });

  const sweepTranslateY = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-28, 28],
  });

  const stepItems = [
    images?.length > 1 ? 'Prepare photos' : 'Prepare photo',
    'Detect ingredients',
    'Review suitability',
  ];

  return (
    <View style={styles.container}>
      <View style={styles.topBadge}>
        <Ionicons name="sparkles-outline" size={14} color="#BFEEDB" />
        <Text style={styles.topBadgeText}>Smart fridge analysis</Text>
      </View>

      <View style={styles.scanStage}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.scanRing,
            {
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.iconWrapper,
            {
              opacity: glow,
              transform: [{ scale: iconScale }],
            },
          ]}
        >
          <Ionicons name="scan-outline" size={54} color="white" />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.scanLine,
              {
                transform: [{ translateY: sweepTranslateY }],
              },
            ]}
          />
        </Animated.View>
      </View>

      <Text style={styles.title}>Analyzing your ingredients</Text>
      <Text style={styles.subtitle}>{statusLine}</Text>

      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <Text style={styles.statusLabel}>Scan in progress</Text>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Working</Text>
          </View>
        </View>
        <View style={styles.stepList}>
          {stepItems.map((item, index) => {
            const active = index === Math.min(phaseIndex, stepItems.length - 1);
            const complete = index < Math.min(phaseIndex, stepItems.length - 1);
            return (
              <View key={item} style={styles.stepRow}>
                <View
                  style={[
                    styles.stepIcon,
                    active ? styles.stepIconActive : null,
                    complete ? styles.stepIconComplete : null,
                  ]}
                >
                  <Ionicons
                    name={complete ? 'checkmark' : active ? 'radio-button-on' : 'ellipse-outline'}
                    size={complete ? 13 : 12}
                    color={complete || active ? 'white' : 'rgba(255,255,255,0.55)'}
                  />
                </View>
                <Text style={[styles.stepText, active ? styles.stepTextActive : null]}>{item}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.metaPill}>
        <Ionicons name="images-outline" size={14} color="#BFEEDB" />
        <Text style={styles.metaText}>
          {images?.length || 1} photo{(images?.length || 1) !== 1 ? 's' : ''} queued for review
        </Text>
      </View>

      <Text style={styles.helperText}>
        Keep this screen open while we read the image and prepare your ingredient list.
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
    backgroundColor: '#071D18',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  topBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(29, 158, 117, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(191, 238, 219, 0.24)',
    marginBottom: 26,
  },
  topBadgeText: {
    color: '#D9F8EC',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  scanStage: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  scanRing: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1,
    borderColor: '#58D9A5',
    backgroundColor: 'rgba(29, 158, 117, 0.16)',
  },
  iconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
    backgroundColor: '#1D9E75',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOpacity: 0.46,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  scanLine: {
    position: 'absolute',
    left: 18,
    right: 18,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    shadowColor: 'white',
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  title: {
    fontSize: 25,
    fontWeight: '800',
    color: 'white',
    marginBottom: 9,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#BFEEDB',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  statusCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    padding: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statusLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(29, 158, 117, 0.20)',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#58D9A5',
  },
  liveText: {
    color: '#D9F8EC',
    fontSize: 11,
    fontWeight: '800',
  },
  stepList: {
    gap: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    marginRight: 10,
  },
  stepIconActive: {
    backgroundColor: '#1D9E75',
    borderColor: '#58D9A5',
  },
  stepIconComplete: {
    backgroundColor: '#0F6E56',
    borderColor: '#58D9A5',
  },
  stepText: {
    flex: 1,
    color: 'rgba(255,255,255,0.68)',
    fontSize: 14,
    fontWeight: '700',
  },
  stepTextActive: {
    color: 'white',
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginTop: 16,
  },
  metaText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#D9F8EC',
  },
  helperText: {
    marginTop: 14,
    maxWidth: 320,
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.68)',
    lineHeight: 17,
  },
  cancelButton: {
    marginTop: 22,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  cancelText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});
