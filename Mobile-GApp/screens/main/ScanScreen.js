// screens/main/ScanScreen.js - WORKING GALLERY-ONLY VERSION
import React, { useState, useEffect } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { 
  getTodayScans, 
  getRemainingScans, 
  incrementScan, 
  initializeScans,
  canUserScan 
} from '../../utils/scanTracker';

export default function ScanScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  
  const [userIsPremium, setUserIsPremium] = useState(false);
  const [remainingScans, setRemainingScans] = useState(3);
  const [isScanning, setIsScanning] = useState(false);
  const [capturedImages, setCapturedImages] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [cameraRef, setCameraRef] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [flashMode, setFlashMode] = useState(Camera?.Constants?.FlashMode?.off ?? null);
  const [hasCameraPermission, setHasCameraPermission] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        await initializeScans();
        const premiumStatus = await AsyncStorage.getItem('userIsPremium') || 'false';
        setUserIsPremium(premiumStatus === 'true');
        const remaining = await getRemainingScans(premiumStatus === 'true');
        setRemainingScans(remaining);
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    };
    
    if (isFocused) {
      loadUserData();
    }
  }, [isFocused]);

  const showUpgradeAlert = () => {
    Alert.alert(
      'Daily Limit Reached',
      'You have used all 3 free scans today. Upgrade to Premium for unlimited scans.',
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
    const canScan = await canUserScan(userIsPremium);
    if (!userIsPremium && !canScan && capturedImages.length === 0) {
      showUpgradeAlert();
      return false;
    }
    return true;
  };

  const recordScanIfNeeded = async () => {
    if (!userIsPremium && capturedImages.length === 0) {
      await incrementScan();
      const remaining = await getRemainingScans(false);
      setRemainingScans(remaining);
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
    const { status } = await Camera.requestCameraPermissionsAsync();
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
    setIsCameraActive(true);
  };

  const toggleFlashMode = () => {
    if (!Camera?.Constants?.FlashMode) return;
    setFlashMode((prev) =>
      prev === Camera.Constants.FlashMode.torch
        ? Camera.Constants.FlashMode.off
        : Camera.Constants.FlashMode.torch
    );
  };

  const capturePhoto = async () => {
    if (!cameraRef) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.takePictureAsync({ quality: 0.7, skipProcessing: true });
      await recordScanIfNeeded();
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
      setIsCameraActive(false);
    }
  };

  const handlePickImage = async () => {
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
      });

      if (!result.canceled) {
        await recordScanIfNeeded();
        
        const newImages = result.assets.map((asset, index) => ({
          id: Date.now().toString() + index,
          uri: asset.uri,
          name: `Image ${capturedImages.length + index + 1}`
        }));
        
        setCapturedImages(prev => [...prev, ...newImages]);
        setShowPreview(true);
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
    
    setTimeout(() => {
      setIsScanning(false);
      navigation.navigate('ScanResults', { 
        images: capturedImages,
        userIsPremium,
      });
    }, 1500);
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
      <View style={styles.header}>
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
          disabled={isScanning || isCapturing}
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
          disabled={isScanning}
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
      <View style={styles.bottomControls}>
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
                {isScanning ? 'Processing...' : `Analyze ${capturedImages.length} Image${capturedImages.length !== 1 ? 's' : ''}`}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.addMoreButton}
              onPress={handlePickImage}
              disabled={isScanning}
            >
              <Ionicons name="add-outline" size={20} color={Colors.primary} />
              <Text style={styles.addMoreText}>Add More</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.uploadButton}
            onPress={handlePickImage}
            disabled={isScanning}
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
      {isCameraActive && (
        <View style={styles.cameraOverlay}>
          <Camera
            ref={(ref) => setCameraRef(ref)}
            style={styles.cameraView}
            type={Camera.Constants.Type.back}
            flashMode={flashMode}
            ratio="16:9"
          />
          <View style={styles.cameraToolbar}>
            <TouchableOpacity style={styles.overlayButton} onPress={() => setIsCameraActive(false)}>
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.overlayButton} onPress={toggleFlashMode}>
              <Ionicons
                name={
                  flashMode === Camera?.Constants?.FlashMode?.torch
                    ? 'flash'
                    : 'flash-off'
                }
                size={24}
                color="white"
              />
            </TouchableOpacity>
          </View>
          <View style={styles.cameraActionRow}>
            <TouchableOpacity
              style={styles.captureButton}
              onPress={capturePhoto}
              disabled={isCapturing}
            >
              <View style={styles.captureCircle}>
                <View style={styles.captureDot} />
              </View>
            </TouchableOpacity>
            <Text style={styles.captureLabel}>{isCapturing ? 'Capturing…' : 'Capture'}</Text>
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
    top: Platform.OS === 'ios' ? 50 : 40,
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
    borderRadius: 12,
    paddingVertical: 14,
    flex: 0.7,
    marginRight: 10,
  },
  analyzeButtonText: {
    marginLeft: 8,
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
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
  overlayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
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
});
