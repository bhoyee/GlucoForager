// screens/main/ScanScreen.js - WORKING GALLERY-ONLY VERSION
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { useAuth } from '../../context/authContext';
import { apiFetch } from '../../utils/api';

let Camera;
let CameraView;
let CameraConstants;
try {
  const CameraModule = require('expo-camera');
  Camera = CameraModule?.Camera ?? CameraModule ?? null;
  CameraView = CameraModule?.CameraView ?? CameraModule?.Camera ?? null;
  CameraConstants = CameraModule?.Camera?.Constants ?? CameraModule?.Constants ?? null;
} catch (error) {
  console.warn('expo-camera module missing', error);
  Camera = null;
  CameraView = null;
  CameraConstants = null;
}

export default function ScanScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const headerTop = Math.max(insets.top, 16);
  const bottomPadding = tabBarHeight + Math.max(insets.bottom, 16);
  const MAX_IMAGES = 5;
  
  const [userIsPremium, setUserIsPremium] = useState(false);
  const [remainingScans, setRemainingScans] = useState(3);
  const [freeLimitCount, setFreeLimitCount] = useState(3);
  const [freeLimitWindowDays, setFreeLimitWindowDays] = useState(1);
  const [isScanning, setIsScanning] = useState(false);
  const [capturedImages, setCapturedImages] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [cameraRef, setCameraRef] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [autoLaunched, setAutoLaunched] = useState(false);
  const maxReached = capturedImages.length >= MAX_IMAGES;

  const getDeviceId = async () => {
    const existing = await AsyncStorage.getItem('deviceId');
    if (existing) return existing;
    const generated = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem('deviceId', generated);
    return generated;
  };

  const loadScanStatus = useCallback(async () => {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) {
      setUserIsPremium(false);
      setRemainingScans(3);
      return;
    }
    const deviceId = await getDeviceId();
    const response = await apiFetch(
      `${API_URL}${API_ENDPOINTS.SCANS_TODAY}`,
      { headers: { Authorization: `Bearer ${token}`, 'X-Device-Id': deviceId } },
      { onUnauthorized: signOut }
    );
    if (response.status === 401) {
      setUserIsPremium(false);
      setRemainingScans(3);
      return;
    }
    if (!response.ok) {
      throw new Error('Unable to fetch scan status.');
    }
    const data = await response.json();
    const isPremium =
      data.is_premium === true ||
      data.subscription_tier === 'premium' ||
      data.searches_left === 'unlimited';
    setUserIsPremium(isPremium);
    setRemainingScans(typeof data.searches_left === 'number' ? data.searches_left : 0);
    if (typeof data.daily_limit === 'number') setFreeLimitCount(data.daily_limit);
    if (typeof data.limit_window_days === 'number') setFreeLimitWindowDays(data.limit_window_days);
  }, [signOut]);

  useEffect(() => {
    if (isFocused) {
      loadScanStatus().catch((error) => {
        console.error('Error loading user data:', error);
      });
    }
  }, [isFocused, loadScanStatus]);

  useEffect(() => {
    if (!isFocused) {
      setAutoLaunched(false);
      return;
    }
    if (!autoLaunched) {
      handleLaunchCamera();
      setAutoLaunched(true);
    }
  }, [isFocused, autoLaunched]);

  const showUpgradeAlert = () => {
    const count = Number.isFinite(Number(freeLimitCount)) ? Number(freeLimitCount) : 3;
    const days = Number.isFinite(Number(freeLimitWindowDays)) ? Number(freeLimitWindowDays) : 1;
    const periodText = days <= 1 ? 'today' : `in the last ${days} days`;
    Alert.alert(
      'Limit Reached',
      `You have used all ${count} free scans/searches ${periodText}. Upgrade to Premium for unlimited access.`,
      [
        { text: 'OK', style: 'cancel' },
        { 
          text: 'Upgrade', 
          onPress: () => navigation.navigate('ProfileTab') 
        }
      ]
    );
  };

  const checkScanLimit = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to scan ingredients.');
        return false;
      }
      const deviceId = await getDeviceId();
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.SCANS_TODAY}`,
        { headers: { Authorization: `Bearer ${token}`, 'X-Device-Id': deviceId } },
        { onUnauthorized: signOut }
      );
      if (response.status === 401) {
        return false;
      }
      const data = await response.json();
      const isPremium =
        data.is_premium === true ||
        data.subscription_tier === 'premium' ||
        data.searches_left === 'unlimited';
      setUserIsPremium(isPremium);
      if (typeof data.searches_left === 'number') {
        setRemainingScans(data.searches_left);
      }
      if (typeof data.daily_limit === 'number') setFreeLimitCount(data.daily_limit);
      if (typeof data.limit_window_days === 'number') setFreeLimitWindowDays(data.limit_window_days);
      const numericLeft = Number(data.searches_left);
      const allowed = isPremium || (Number.isFinite(numericLeft) && numericLeft > 0);
      if (!allowed && capturedImages.length === 0) {
        showUpgradeAlert();
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error checking scan limit:', error);
      Alert.alert('Error', 'Unable to check scan limit. Please try again.');
      return false;
    }
  };

  const requestCameraPermission = async () => {
    if (hasCameraPermission === false) {
      Alert.alert('Permission required', 'Camera permission is required to scan ingredients.');
      return false;
    }
    if (hasCameraPermission === true) {
      return true;
    }
    if (!Camera?.requestCameraPermissionsAsync && !Camera?.Camera?.requestCameraPermissionsAsync) {
      Alert.alert('Camera unavailable', 'Camera module is not supported on this device.');
      return false;
    }
    const requestPermission = Camera?.requestCameraPermissionsAsync ?? Camera?.Camera?.requestCameraPermissionsAsync;
    const { status } = await requestPermission();
    const granted = status === 'granted';
    setHasCameraPermission(granted);
    if (!granted) {
      Alert.alert('Permission required', 'Please allow access to your camera.');
    }
    return granted;
  };

  const handleLaunchCamera = async () => {
    const allowed = await checkScanLimit();
    if (!allowed) return;
    const permissionGranted = await requestCameraPermission();
    if (!permissionGranted) return;
    if (!CameraView) {
      Alert.alert('Camera unavailable', 'Camera module is not available on this device.');
      return;
    }
    setIsCameraActive(true);
  };

  const toggleTorch = () => {
    setTorchEnabled((prev) => !prev);
  };

  const capturePhoto = async () => {
    if (maxReached) {
      Alert.alert('Max reached', `You can add up to ${MAX_IMAGES} photos per scan.`);
      return;
    }
    if (!cameraRef || !CameraView) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.takePictureAsync({ quality: 0.7, skipProcessing: true, base64: false });
      const newImage = {
        id: Date.now().toString(),
        uri: photo.uri,
        name: `Photo ${capturedImages.length + 1}`,
      };
      setCapturedImages((prev) => [...prev, newImage]);
      setShowPreview(true);
    } catch (error) {
      console.error('Capture failed', error);
      Alert.alert('Capture failed', 'Unable to take a photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handlePickImage = async () => {
    if (maxReached) {
      Alert.alert('Max reached', `You can add up to ${MAX_IMAGES} photos per scan.`);
      return;
    }
    const allowed = await checkScanLimit();
    if (!allowed) return;

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please allow access to your photo library.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        allowsMultipleSelection: true,
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled) {
        const remainingSlots = Math.max(0, MAX_IMAGES - capturedImages.length);
        const pickedAssets = result.assets.slice(0, remainingSlots);
        const newImages = pickedAssets.map((asset, index) => ({
          id: Date.now().toString() + index,
          uri: asset.uri,
          name: `Image ${capturedImages.length + index + 1}`
        }));
        
        setCapturedImages(prev => [...prev, ...newImages]);
        setShowPreview(true);

        if (result.assets.length > remainingSlots) {
          Alert.alert('Max reached', `Only the first ${MAX_IMAGES} photos were added.`);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const handleAnalyzeImages = async () => {
    if (capturedImages.length === 0) {
      Alert.alert('No Images', 'Please select at least one image before analyzing.');
      return;
    }
    setIsScanning(true);
    setIsCameraActive(false);
    navigation.navigate('ScanProcessing', {
      images: capturedImages,
      userIsPremium,
    });
    setIsScanning(false);
  };

  const handleDeleteImage = (imageId) => {
    const newImages = capturedImages.filter(img => img.id !== imageId);
    setCapturedImages(newImages);
    if (newImages.length === 0) {
      setShowPreview(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { top: headerTop }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan Ingredients</Text>
        <TouchableOpacity 
          style={styles.flashButton}
          onPress={() => Alert.alert('Info', 'Use gallery to select ingredient images.')}
        >
          <Ionicons name="images-outline" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        <Ionicons name="camera" size={80} color="white" />
        <Text style={styles.title}>Image Scanner</Text>
        <Text style={styles.subtitle}>
          Select images from your gallery to scan ingredients
        </Text>
        
        <TouchableOpacity 
          style={[styles.galleryButton, styles.launchButton]}
          onPress={handleLaunchCamera}
          disabled={isScanning || isCapturing || maxReached}
        >
          {isCapturing ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Ionicons name="camera" size={24} color="white" />
              <Text style={[styles.galleryButtonText, styles.launchButtonText]}>Launch Camera</Text>
            </>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.galleryButton}
          onPress={handlePickImage}
          disabled={isScanning || maxReached}
        >
          {isScanning ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Ionicons name="images-outline" size={24} color="white" />
              <Text style={styles.galleryButtonText}>Pick from Gallery</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Captured Images Preview */}
      {showPreview && capturedImages.length > 0 && (
        <View style={styles.previewContainer}>
          <Text style={styles.previewTitle}>Selected Images</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewScroll}>
            {capturedImages.map((image) => (
              <View key={image.id} style={styles.previewItem}>
                <Image source={{ uri: image.uri }} style={styles.previewImage} />
                <TouchableOpacity 
                  style={styles.deleteButton}
                  onPress={() => handleDeleteImage(image.id)}
                >
                  <Ionicons name="close-circle" size={20} color="white" />
                </TouchableOpacity>
                <Text style={styles.imageName} numberOfLines={1}>{image.name}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Bottom Controls */}
      <View style={[styles.bottomControls, { paddingBottom: bottomPadding }]}>
        {/* Scan Counter */}
        <View style={styles.counterCard}>
          <View style={styles.counterContent}>
            <Ionicons name="camera-outline" size={20} color={Colors.primary} />
            <Text style={styles.counterText}>
              {userIsPremium 
                ? 'Unlimited scans' 
                : `${remainingScans} scans left today`
              }
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        {capturedImages.length > 0 ? (
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={styles.analyzeButton}
              onPress={handleAnalyzeImages}
              disabled={isScanning}
            >
              <Ionicons name="analytics-outline" size={20} color="white" />
              <Text style={styles.analyzeButtonText}>
                {isScanning
                  ? 'Processing...'
                  : `Analyze ${capturedImages.length} image${capturedImages.length !== 1 ? 's' : ''}`}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.addMoreButton}
              onPress={handlePickImage}
              disabled={isScanning || maxReached}
            >
              <Ionicons name="add-outline" size={20} color={Colors.primary} />
              <Text style={styles.addMoreText}>{maxReached ? `Max ${MAX_IMAGES}` : 'Add More'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.uploadButton}
            onPress={handlePickImage}
            disabled={isScanning || maxReached}
          >
            <Ionicons name="image-outline" size={20} color={Colors.text} />
            <Text style={styles.uploadButtonText}>Select Images from Gallery</Text>
          </TouchableOpacity>
        )}

        {/* Premium Upgrade Prompt */}
        {!userIsPremium && remainingScans <= 1 && capturedImages.length === 0 && (
          <TouchableOpacity 
            style={styles.upgradePrompt}
            onPress={() => navigation.navigate('ProfileTab')}
          >
            <View style={styles.upgradeContent}>
              <Ionicons name="sparkles" size={16} color={Colors.primary} />
              <Text style={styles.upgradeText}>
                Upgrade to Premium for unlimited scans
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
      {isCameraActive && CameraView && (
        <View style={styles.cameraOverlay}>
          <CameraView
            ref={(ref) => setCameraRef(ref)}
            style={styles.cameraView}
            facing={CameraConstants?.Type?.back ?? Camera?.Constants?.Type?.back ?? 'back'}
            enableTorch={torchEnabled}
            flash="off"
            ratio="16:9"
          />
          <View style={styles.cameraToolbar}>
            <TouchableOpacity style={styles.overlayButton} onPress={() => setIsCameraActive(false)}>
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.overlayButton} onPress={toggleTorch}>
              <Ionicons
                name={torchEnabled ? 'flash' : 'flash-off'}
                size={24}
                color="white"
              />
            </TouchableOpacity>
          </View>
          <View style={styles.cameraPreviewStrip}>
            {capturedImages.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {capturedImages.map((image) => (
                  <View key={image.id} style={styles.cameraPreviewItem}>
                    <Image source={{ uri: image.uri }} style={styles.cameraPreviewImage} />
                    <TouchableOpacity
                      style={styles.cameraDeleteButton}
                      onPress={() => handleDeleteImage(image.id)}
                    >
                      <Ionicons name="close-circle" size={18} color="white" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity
              style={styles.galleryOverlayButton}
              onPress={handlePickImage}
              disabled={maxReached}
            >
              <Ionicons name="images-outline" size={18} color="white" />
              <Text style={styles.galleryOverlayText}>Gallery</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.cameraActionRow}>
            <TouchableOpacity
              style={styles.captureButton}
              onPress={capturePhoto}
              disabled={isCapturing || maxReached}
            >
              <View style={styles.captureCircle}>
                <View style={styles.captureDot} />
              </View>
            </TouchableOpacity>
            <Text style={styles.captureLabel}>
              {isCapturing ? 'Capturing...' : maxReached ? `Max ${MAX_IMAGES} reached` : 'Capture'}
            </Text>
            {capturedImages.length > 0 && (
              <TouchableOpacity
                style={styles.analyzeOverlayButton}
                onPress={handleAnalyzeImages}
                disabled={isScanning}
              >
                <Ionicons name="analytics-outline" size={18} color="white" />
                <Text style={styles.analyzeOverlayText}>
                  {isScanning
                    ? 'Processing...'
                    : `Analyze ${capturedImages.length} image${capturedImages.length !== 1 ? 's' : ''}`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
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
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  flashButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
  },
  subtitle: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  galleryButton: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 25,
    paddingVertical: 15,
    borderRadius: 25,
    marginTop: 10,
  },
  galleryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
  },
  launchButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: Colors.primary,
    marginBottom: 10,
  },
  launchButtonText: {
    color: 'white',
  },
  previewContainer: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: Colors.primary,
  },
  previewTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  previewScroll: {
    paddingHorizontal: 10,
  },
  previewItem: {
    alignItems: 'center',
    marginRight: 15,
  },
  previewImage: {
    width: 100,
    height: 100,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  deleteButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
  },
  imageName: {
    color: 'white',
    fontSize: 12,
    marginTop: 5,
    maxWidth: 100,
  },
  bottomControls: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 30,
    paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  counterCard: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 20,
  },
  counterContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  counterText: {
    marginLeft: 8,
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  analyzeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 18,
    flex: 0.75,
    marginRight: 10,
  },
  analyzeButtonText: {
    marginLeft: 10,
    fontSize: 18,
    color: 'white',
    fontWeight: '700',
  },
  addMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    paddingVertical: 14,
    flex: 0.3,
  },
  addMoreText: {
    marginLeft: 4,
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 15,
  },
  uploadButtonText: {
    marginLeft: 8,
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500',
  },
  upgradePrompt: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  upgradeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeText: {
    marginLeft: 8,
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'black',
    zIndex: 50,
    justifyContent: 'center',
  },
  cameraView: {
    ...StyleSheet.absoluteFillObject,
  },
  cameraToolbar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  toolbarRight: {
    flexDirection: 'row',
    gap: 12,
  },
  overlayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraPreviewStrip: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 120 : 100,
    left: 16,
    right: 16,
  },
  galleryOverlayButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  galleryOverlayText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  cameraPreviewItem: {
    marginRight: 10,
  },
  cameraPreviewImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  cameraDeleteButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
  },
  cameraActionRow: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 60 : 40,
    left: 0,
    right: 0,
    flexDirection: 'column',
    alignItems: 'center',
  },
  captureButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  captureCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'red',
  },
  captureLabel: {
    marginTop: 8,
    color: 'white',
    fontSize: 16,
  },
  analyzeOverlayButton: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: Colors.primary,
  },
  analyzeOverlayText: {
    marginLeft: 10,
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
});
