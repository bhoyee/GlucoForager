import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { apiFetch } from '../../utils/api';
import { API_URL } from '../../config/api';
import { trackEvent } from '../../utils/analytics';

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

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'];

const VERDICT_STYLE = {
  good_fit: { label: 'Diabetes-friendly', color: Colors.success },
  moderate: { label: 'Moderate', color: Colors.warning },
  use_caution: { label: 'Use caution', color: Colors.danger },
  unknown: { label: 'Not enough info', color: Colors.textLight },
};

export default function BarcodeScanScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();

  const [hasPermission, setHasPermission] = useState(null);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [result, setResult] = useState(null);

  // A lit torch measurably slows down how fast the OS actually releases the camera
  // session on teardown - leaving it on while switching to Photo scan was causing
  // "couldn't capture the photo" there, since the new screen's onCameraReady fires
  // before the old camera+torch have genuinely finished releasing. Turn it off the
  // moment this screen loses focus, before the switch/unmount happens.
  useEffect(() => {
    if (!isFocused) {
      setTorchEnabled(false);
    }
    return () => setTorchEnabled(false);
  }, [isFocused]);
  const [isLooking, setIsLooking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const scanLockRef = useRef(false);

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

  const lookupBarcode = useCallback(async (code) => {
    setIsLooking(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to scan a product.');
        return;
      }
      const response = await apiFetch(
        `${API_URL}/api/app/barcode/${code}`,
        { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
        { timeoutMs: 10000 }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.found) {
        setResult({ found: false, barcode: code });
        trackEvent('barcode_scan_result', { found: false });
        return;
      }
      setResult({ ...data, found: true });
      trackEvent('barcode_scan_result', {
        found: true,
        verdict: data?.diabetes_note?.verdict ?? null,
        has_nutrition_data: data?.has_nutrition_data ?? null,
      });
    } catch {
      setResult({ found: false, barcode: code });
      trackEvent('barcode_scan_result', { found: false, error: true });
    } finally {
      setIsLooking(false);
    }
  }, []);

  const handleBarcodeScanned = useCallback(
    ({ data }) => {
      if (scanLockRef.current || !data) return;
      scanLockRef.current = true;
      trackEvent('barcode_scan_started');
      lookupBarcode(data);
    },
    [lookupBarcode]
  );

  const handleScanAgain = () => {
    setResult(null);
    scanLockRef.current = false;
  };

  const handleLogProduct = async () => {
    if (!result?.found || isSaving) return;
    setIsSaving(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to log this product.');
        return;
      }
      const response = await apiFetch(
        `${API_URL}/api/app/meals`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: result.name,
            source: 'barcode',
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
      // This screen is reachable from two different tab stacks (Scan tab's mode
      // switcher, and the Log Meal screen's "scan barcode" link) - always land back
      // on Home rather than goBack(), so the second path doesn't dump the user on
      // the unrelated Scan tab.
      navigation.navigate('Home', { screen: 'HomeMain' });
    } catch {
      Alert.alert('Unable to log meal', 'Network request failed. Please check your connection.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { top: insets.top + 12 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="white" />
        </TouchableOpacity>
        <View style={styles.modeSwitcher}>
          <TouchableOpacity
            style={styles.modeOption}
            onPress={() => navigation.replace('ScanMain')}
          >
            <Text style={styles.modeOptionText}>Ingredients</Text>
          </TouchableOpacity>
          <View style={[styles.modeOption, styles.modeOptionActive]}>
            <Text style={styles.modeOptionTextActive}>Barcode</Text>
          </View>
          <TouchableOpacity
            style={styles.modeOption}
            onPress={() => navigation.replace('PhotoScan')}
          >
            <Text style={styles.modeOptionText}>Photo</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => setTorchEnabled((prev) => !prev)}
          disabled={hasPermission !== true}
        >
          <Ionicons name={torchEnabled ? 'flash' : 'flash-off'} size={22} color="white" />
        </TouchableOpacity>
      </View>

      {hasPermission === false || !CameraView ? (
        <View style={styles.centerMessage}>
          <Ionicons name="camera-outline" size={40} color="rgba(255,255,255,0.6)" />
          <Text style={styles.centerMessageText}>
            Camera access is needed to scan a barcode. You can enable it in your device settings.
          </Text>
        </View>
      ) : isFocused && hasPermission ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torchEnabled}
          barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
          onBarcodeScanned={result || isLooking ? undefined : handleBarcodeScanned}
        />
      ) : null}

      {!result && !isLooking ? (
        <View style={styles.scanFrameWrap} pointerEvents="none">
          <View style={styles.scanFrame} />
          <Text style={styles.scanHint}>Point the camera at a product's barcode</Text>
        </View>
      ) : null}

      {isLooking ? (
        <View style={styles.centerMessage}>
          <ActivityIndicator size="large" color="white" />
          <Text style={styles.centerMessageText}>Looking up product...</Text>
        </View>
      ) : null}

      {result ? (
        <View style={[styles.resultCard, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
          {result.found ? (
            <>
              <Text style={styles.eyebrow}>Diabetes check</Text>
              <View style={styles.resultTitleRow}>
                <Text style={styles.resultTitle} numberOfLines={2}>
                  {result.name}
                </Text>
                {result.diabetes_note ? (
                  <View
                    style={[
                      styles.verdictBadge,
                      { backgroundColor: `${VERDICT_STYLE[result.diabetes_note.verdict]?.color ?? Colors.textLight}18` },
                    ]}
                  >
                    <Text
                      style={[
                        styles.verdictBadgeText,
                        { color: VERDICT_STYLE[result.diabetes_note.verdict]?.color ?? Colors.textLight },
                      ]}
                    >
                      {VERDICT_STYLE[result.diabetes_note.verdict]?.label ?? 'Unrated'}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.resultMeta}>
                {result.carbs_g != null ? `${result.carbs_g}g carbs` : 'Carbs unknown'}
                {result.net_carbs_g != null ? ` (${result.net_carbs_g}g net)` : ''}
                {result.sugars_g != null ? ` • ${result.sugars_g}g sugar` : ''}
                {result.calories != null ? ` • ${result.calories} cal` : ''}
                {result.basis === 'per_100g' ? ' (per 100g)' : result.basis === 'serving' ? ' (per serving)' : ''}
              </Text>

              {result.diabetes_note?.flags?.length ? (
                <View style={styles.flagRow}>
                  {result.diabetes_note.flags.map((flag) => (
                    <View key={flag} style={styles.flagChip}>
                      <Text style={styles.flagChipText}>{flag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {result.has_nutrition_data === false ? (
                <View style={styles.noDataNudge}>
                  <Text style={styles.noDataNudgeText}>
                    This barcode has no nutrition label data on file - common for fresh produce. Photo scan can
                    usually estimate it instead.
                  </Text>
                  <TouchableOpacity
                    onPress={() => navigation.replace('PhotoScan')}
                    style={styles.noDataNudgeButton}
                  >
                    <Text style={styles.noDataNudgeButtonText}>Try photo scan</Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              ) : null}

              <Text style={styles.disclaimer}>
                General guide based on sugar, processing level, and fiber - not medical advice.
              </Text>

              <TouchableOpacity
                style={[styles.primaryButton, isSaving && styles.buttonDisabled]}
                onPress={handleLogProduct}
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
              <Text style={styles.resultTitle}>Product not found</Text>
              <Text style={styles.resultMeta}>We couldn't find that barcode. Try again, or log it manually.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={handleScanAgain}>
                <Text style={styles.primaryButtonText}>Scan again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => navigation.navigate('LogMeal')}
              >
                <Text style={styles.secondaryButtonText}>Log manually</Text>
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
  modeOption: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  modeOptionActive: { backgroundColor: 'white' },
  modeOptionText: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '700' },
  modeOptionTextActive: { color: Colors.primaryDark, fontSize: 13, fontWeight: '800' },
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
    width: 260,
    height: 160,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  scanHint: { marginTop: 18, color: 'white', fontSize: 13, fontWeight: '700' },
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
  verdictBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  verdictBadgeText: { fontSize: 11, fontWeight: '900' },
  resultMeta: { marginTop: 6, fontSize: 13, color: Colors.textLight, fontWeight: '600', lineHeight: 19 },
  flagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  flagChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: `${Colors.danger}12`,
  },
  flagChipText: { fontSize: 11, fontWeight: '800', color: Colors.danger },
  noDataNudge: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: `${Colors.primary}0C`,
    borderWidth: 1,
    borderColor: `${Colors.primary}22`,
  },
  noDataNudgeText: { fontSize: 12, lineHeight: 17, color: Colors.textLight, fontWeight: '600' },
  noDataNudgeButton: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  noDataNudgeButtonText: { fontSize: 13, fontWeight: '800', color: Colors.primary },
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
