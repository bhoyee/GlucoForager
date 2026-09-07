import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Image, Animated, Easing } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { Colors } from '../../constants/Colors';
import { apiFetch } from '../../utils/api';
import { API_URL } from '../../config/api';

let Camera;
let CameraView;
try {
  const CameraModule = require('expo-camera');
  Camera = CameraModule?.Camera ?? CameraModule ?? null;
  CameraView = CameraModule?.CameraView ?? CameraModule?.Camera ?? null;
} catch (error) {
  console.warn('expo-camera module missing', error);
  Camera = null;
  CameraView = null;
}

const HOLD_STEADY_SECONDS = 2;

const VERDICT_STYLE = {
  good_fit: { label: 'Diabetes-friendly', color: Colors.success },
  moderate: { label: 'Moderate', color: Colors.warning },
  use_caution: { label: 'Use caution', color: Colors.danger },
  unknown: { label: 'Not enough info', color: Colors.textLight },
};

export default function PhotoScanScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();

  const [hasPermission, setHasPermission] = useState(null);
  const [cameraRef, setCameraRef] = useState(null);
  // 'countdown' | 'capturing' | 'analyzing' | 'result'
  const [phase, setPhase] = useState('countdown');
  const [countdown, setCountdown] = useState(HOLD_STEADY_SECONDS);
  const [capturedUri, setCapturedUri] = useState(null);
  const [result, setResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const countdownTimerRef = useRef(null);

  useEffect(() => {
    const requestPermission = async () => {
      if (!Camera?.requestCameraPermissionsAsync && !Camera?.Camera?.requestCameraPermissionsAsync) {
        setHasPermission(false);
        return;
      }
      const request = Camera?.requestCameraPermissionsAsync ?? Camera?.Camera?.requestCameraPermissionsAsync;
      const { status } = await request();
      setHasPermission(status === 'granted');
    };
    requestPermission();
  }, []);

  const clearCountdownTimer = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  };

  const capturePhoto = useCallback(async () => {
    if (!cameraRef) return;
    setPhase('capturing');
    try {
      // Capture at full res without base64, then resize+compress before encoding -
      // a raw full-camera-resolution base64 photo can be several MB, which fails at
      // the network layer on some devices/connections. Matches the same
      // resize-then-base64 approach ScanProcessingScreen.js already uses for the
      // ingredient-photo flow.
      const photo = await cameraRef.takePictureAsync({ quality: 0.7, skipProcessing: true, base64: false });
      setCapturedUri(photo?.uri || null);

      const manipulated = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 768 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!manipulated?.base64) {
        Alert.alert('Scan failed', 'Could not process the photo. Please try again.');
        setPhase('countdown');
        setCountdown(HOLD_STEADY_SECONDS);
        return;
      }

      setPhase('analyzing');

      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to scan food.');
        setPhase('countdown');
        setCountdown(HOLD_STEADY_SECONDS);
        return;
      }
      const response = await apiFetch(
        `${API_URL}/api/app/food-scan`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: manipulated.base64 }),
        },
        { timeoutMs: 30000 }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 402) {
          Alert.alert('Start your 7-day free trial', data?.detail?.message || 'Food scanning is a premium feature.');
        } else if (response.status === 429) {
          Alert.alert('Slow down', data?.detail?.message || 'Please try again shortly.');
        } else {
          Alert.alert('Scan failed', data?.detail?.message || data?.detail || 'Please try again.');
        }
        setPhase('countdown');
        setCountdown(HOLD_STEADY_SECONDS);
        return;
      }
      const data = await response.json();
      setResult(data);
      setPhase('result');
    } catch {
      Alert.alert('Scan failed', 'Network request failed. Please check your connection.');
      setPhase('countdown');
      setCountdown(HOLD_STEADY_SECONDS);
    }
  }, [cameraRef]);

  // Hold-steady countdown: starts as soon as the camera is ready and this screen is
  // focused, restarts on "Scan again". Deliberately a fixed timer, not true motion
  // detection - keeps this to one AI call per attempt (cost-bounded), and the AI's
  // own "not food" classification is what actually catches a bad/empty capture.
  useEffect(() => {
    if (phase !== 'countdown' || !isFocused || !hasPermission || !CameraView) {
      clearCountdownTimer();
      return;
    }
    setCountdown(HOLD_STEADY_SECONDS);
    const startedAt = Date.now();
    countdownTimerRef.current = setInterval(() => {
      const remaining = HOLD_STEADY_SECONDS - (Date.now() - startedAt) / 1000;
      if (remaining <= 0) {
        clearCountdownTimer();
        setCountdown(0);
        capturePhoto();
        return;
      }
      setCountdown(remaining);
    }, 100);
    return clearCountdownTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isFocused, hasPermission, cameraRef]);

  useEffect(() => {
    if (phase !== 'analyzing') return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scanLineAnim, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase, scanLineAnim]);

  const handleScanAgain = () => {
    setResult(null);
    setCapturedUri(null);
    setPhase('countdown');
    setCountdown(HOLD_STEADY_SECONDS);
  };

  const handleLogFood = async () => {
    if (!result?.is_food || isSaving) return;
    setIsSaving(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to log this.');
        return;
      }
      const response = await apiFetch(
        `${API_URL}/api/app/meals`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: result.name || 'Scanned food',
            source: 'photo',
            carbs_g: result.carbs_g ?? undefined,
            calories: result.calories ?? undefined,
          }),
        },
        { timeoutMs: 8000 }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        Alert.alert('Unable to log meal', data?.detail?.message || data?.detail || 'Please try again.');
        return;
      }
      navigation.navigate('Home', { screen: 'HomeMain' });
    } catch {
      Alert.alert('Unable to log meal', 'Network request failed. Please check your connection.');
    } finally {
      setIsSaving(false);
    }
  };

  const scanLineTranslate = scanLineAnim.interpolate({ inputRange: [0, 1], outputRange: [-90, 90] });
  const verdictInfo = result?.diabetes_note ? VERDICT_STYLE[result.diabetes_note.verdict] : null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { top: insets.top + 12 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="white" />
        </TouchableOpacity>
        <View style={styles.modeSwitcher}>
          <TouchableOpacity style={styles.modeOption} onPress={() => navigation.navigate('ScanMain')}>
            <Text style={styles.modeOptionText}>Ingredients</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modeOption} onPress={() => navigation.navigate('BarcodeScan')}>
            <Text style={styles.modeOptionText}>Barcode</Text>
          </TouchableOpacity>
          <View style={[styles.modeOption, styles.modeOptionActive]}>
            <Text style={styles.modeOptionTextActive}>Photo</Text>
          </View>
        </View>
        <View style={styles.headerButton} />
      </View>

      {hasPermission === false || !CameraView ? (
        <View style={styles.centerMessage}>
          <Ionicons name="camera-outline" size={40} color="rgba(255,255,255,0.6)" />
          <Text style={styles.centerMessageText}>
            Camera access is needed to scan food. You can enable it in your device settings.
          </Text>
        </View>
      ) : phase === 'countdown' || phase === 'capturing' ? (
        isFocused ? (
          <CameraView ref={(ref) => setCameraRef(ref)} style={StyleSheet.absoluteFill} facing="back" />
        ) : null
      ) : capturedUri ? (
        <Image source={{ uri: capturedUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}

      {(phase === 'countdown' || phase === 'capturing') && hasPermission && CameraView ? (
        <View style={styles.scanFrameWrap} pointerEvents="none">
          <View style={styles.scanFrame} />
          <Text style={styles.scanHint}>
            {phase === 'capturing' ? 'Capturing...' : `Hold steady - scanning in ${Math.ceil(countdown)}...`}
          </Text>
        </View>
      ) : null}

      {phase === 'analyzing' ? (
        <View style={styles.scanFrameWrap} pointerEvents="none">
          <View style={styles.scanFrame}>
            <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineTranslate }] }]} />
          </View>
          <View style={styles.analyzingBadge}>
            <ActivityIndicator size="small" color="white" />
            <Text style={styles.scanHint}>Analyzing...</Text>
          </View>
        </View>
      ) : null}

      {phase === 'result' && result ? (
        <View style={[styles.resultCard, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
          {result.is_food ? (
            <>
              <Text style={styles.eyebrow}>Diabetes check</Text>
              <View style={styles.resultTitleRow}>
                <Text style={styles.resultTitle} numberOfLines={2}>
                  {result.name || 'Unidentified food'}
                </Text>
                {verdictInfo ? (
                  <View style={[styles.verdictBadge, { backgroundColor: `${verdictInfo.color}18` }]}>
                    <Text style={[styles.verdictBadgeText, { color: verdictInfo.color }]}>{verdictInfo.label}</Text>
                  </View>
                ) : null}
              </View>

              {result.carbs_g != null || result.calories != null ? (
                <Text style={styles.resultMeta}>
                  {result.carbs_g != null ? `~${result.carbs_g}g carbs` : ''}
                  {result.net_carbs_g != null ? ` (${result.net_carbs_g}g net)` : ''}
                  {result.sugars_g != null ? ` • ~${result.sugars_g}g sugar` : ''}
                  {result.calories != null ? ` • ~${result.calories} cal` : ''}
                </Text>
              ) : (
                <Text style={styles.resultMeta}>Couldn't estimate nutrition for this one.</Text>
              )}

              {result.diabetes_note?.flags?.length ? (
                <View style={styles.flagRow}>
                  {result.diabetes_note.flags.map((flag) => (
                    <View key={flag} style={styles.flagChip}>
                      <Text style={styles.flagChipText}>{flag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <Text style={styles.disclaimer}>
                Estimated from a photo - a rough guide, not an exact measurement or medical advice.
              </Text>

              <TouchableOpacity
                style={[styles.primaryButton, isSaving && styles.buttonDisabled]}
                onPress={handleLogFood}
                disabled={isSaving}
              >
                <Text style={styles.primaryButtonText}>{isSaving ? 'Logging...' : 'Log this meal'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleScanAgain}>
                <Text style={styles.secondaryButtonText}>Scan again</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.resultTitle}>This doesn't look like food</Text>
              <Text style={styles.resultMeta}>
                Try repositioning so the food fills the box, then scan again.
              </Text>
              <TouchableOpacity style={styles.primaryButton} onPress={handleScanAgain}>
                <Text style={styles.primaryButtonText}>Scan again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('LogMeal')}>
                <Text style={styles.secondaryButtonText}>Log manually instead</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  headerButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  modeSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 999,
    padding: 3,
  },
  modeOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  modeOptionActive: { backgroundColor: 'white' },
  modeOptionText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '700' },
  modeOptionTextActive: { color: Colors.primaryDark, fontSize: 12, fontWeight: '800' },
  centerMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 14,
  },
  centerMessageText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  scanFrameWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 240,
    height: 240,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 3,
    backgroundColor: Colors.success,
    shadowColor: Colors.success,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  scanHint: { marginTop: 18, color: 'white', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  analyzingBadge: { marginTop: 18, alignItems: 'center', gap: 8 },
  resultCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  resultTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  resultTitle: { flex: 1, fontSize: 18, fontWeight: '900', color: Colors.text },
  verdictBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  verdictBadgeText: { fontSize: 11, fontWeight: '900' },
  resultMeta: { marginTop: 6, fontSize: 13, color: Colors.textLight, fontWeight: '600', lineHeight: 19 },
  flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  flagChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: `${Colors.danger}12`,
  },
  flagChipText: { fontSize: 11, fontWeight: '800', color: Colors.danger },
  disclaimer: { marginTop: 10, fontSize: 11, lineHeight: 15, color: Colors.textMuted, fontWeight: '600' },
  primaryButton: {
    marginTop: 18,
    height: 50,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: 'white', fontSize: 15, fontWeight: '800' },
  secondaryButton: { marginTop: 10, height: 46, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: Colors.textLight, fontSize: 14, fontWeight: '700' },
});
