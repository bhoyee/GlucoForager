import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
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

        const response = await apiFetch(
          `${API_URL}${API_ENDPOINTS.AI_VISION_RECIPES_BATCH}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'X-Device-Id': deviceId,
            },
            body: JSON.stringify({ images_base64: imagesBase64 }),
          },
          { onUnauthorized: signOut }
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

        if (!data?.detected?.length) {
          Alert.alert('Scan failed', 'No food ingredients detected.');
          navigation.goBack();
          return;
        }

        navigation.replace('ScanResults', {
          images,
          userIsPremium,
          detectedIngredients: data.detected || [],
          recipes: data.results || [],
          warning: data.warning || null,
        });
      } catch (error) {
        Alert.alert('Scan failed', 'Unable to analyze image. Please try again.');
        navigation.goBack();
      }
    };

    runAnalysis();
  }, [images, navigation, signOut, userIsPremium]);

  const getDeviceId = async () => {
    const existing = await AsyncStorage.getItem('deviceId');
    if (existing) return existing;
    const generated = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem('deviceId', generated);
    return generated;
  };

  const glow = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.9],
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.iconWrapper, { opacity: glow }]}>
        <Ionicons name="sparkles" size={56} color="white" />
      </Animated.View>
      <Text style={styles.title}>Analyzing Ingredients</Text>
      <Text style={styles.subtitle}>
        We are scanning your images to find diabetes-friendly recipes.
      </Text>
      <ActivityIndicator size="large" color="white" style={styles.spinner} />
      <Text style={styles.progressText}>
        Processing {images?.length || 1} image{(images?.length || 1) !== 1 ? 's' : ''}...
      </Text>
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
});
