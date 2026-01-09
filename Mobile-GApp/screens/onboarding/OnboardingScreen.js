// screens/onboarding/OnboardingScreen.js - UPDATED
import React, { useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/authContext'; // ADD THIS IMPORT

const { width } = Dimensions.get('window');

const onboardingData = [
  {
    id: '1',
    icon: '📸',
    title: 'Scan Ingredients',
    description: 'Take a photo of your fridge or pantry',
    subDescription: 'AI automatically detects ingredients from your photo',
    color: '#2E8B57',
  },
  {
    id: '2',
    icon: '✅',
    title: 'Select from Scan List',
    description: 'Review & customize detected ingredients',
    subDescription: 'Toggle items on/off and add missing ingredients manually',
    color: '#3182CE',
  },
  {
    id: '3',
    icon: '🥗',
    title: 'Diabetes-Safe Recipes',
    description: 'Get AI-matched low-glycemic recipes',
    subDescription: 'Filtered for diabetes-friendly ingredients and nutrition',
    color: '#38A169',
  },
  {
    id: '4',
    icon: '👨‍🍳',
    title: 'Cook with Confidence',
    description: 'Clear instructions & safety notes',
    subDescription: 'Step-by-step guides with carb counts and safety alerts',
    color: '#ED8936',
  },
];

export default function OnboardingScreen() {
  const navigation = useNavigation();
  const { completeOnboarding } = useAuth(); // ADD THIS
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef(null);

  const renderItem = ({ item }) => (
    <View style={[styles.slide, { width }]}>
      {/* Image/Icon */}
      <View style={styles.imageContainer}>
        <View style={[styles.iconCircle, { backgroundColor: `${item.color}20` }]}>
          <Text style={styles.icon}>{item.icon}</Text>
        </View>
      </View>
      
      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.slideNumber}>
          Step {parseInt(item.id)} of {onboardingData.length}
        </Text>
        
        <Text style={styles.slideTitle}>{item.title}</Text>
        
        <Text style={styles.slideDescription}>{item.description}</Text>
        
        <Text style={styles.slideSubDescription}>{item.subDescription}</Text>
        
        {/* Feature Dots */}
        <View style={styles.featureDots}>
          {onboardingData.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.featureDot,
                { 
                  backgroundColor: idx === currentIndex ? item.color : '#E2E8F0',
                  width: idx === currentIndex ? 24 : 8,
                }
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
// In your OnboardingScreen.js, update the skip and get started handlers:
const skipToLogin = async () => {
  try {
    await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
    navigation.navigate('Login');
  } catch (error) {
    console.error('Error skipping onboarding:', error);
    navigation.navigate('Login');
  }
};

const handleComplete = async () => {
  try {
    await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
    navigation.navigate('Login');
  } catch (error) {
    console.error('Error completing onboarding:', error);
    navigation.navigate('Login');
  }
};
  const goToNext = () => {
    if (currentIndex < onboardingData.length - 1) {
      flatListRef.current.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      handleComplete();
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      flatListRef.current.scrollToIndex({ index: currentIndex - 1 });
      setCurrentIndex(currentIndex - 1);
    }
  };

//   const skipToLogin = () => {
//     handleComplete();
//   };

  return (
    <View style={styles.container}>
      {/* Skip Button */}
      <TouchableOpacity style={styles.skipButton} onPress={skipToLogin}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={onboardingData}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
      />

      {/* Navigation Buttons */}
      <View style={styles.navigation}>
        <View style={styles.buttonContainer}>
          {currentIndex > 0 ? (
            <TouchableOpacity style={styles.backButton} onPress={goToPrevious}>
              <Ionicons name="arrow-back" size={20} color={Colors.primary} />
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.placeholder} />
          )}
          
          <TouchableOpacity style={styles.nextButton} onPress={goToNext}>
            <Text style={styles.nextButtonText}>
              {currentIndex === onboardingData.length - 1 ? 'Get Started' : 'Next'}
            </Text>
            <Ionicons 
              name={currentIndex === onboardingData.length - 1 ? "checkmark-circle" : "arrow-forward"} 
              size={20} 
              color="white" 
              style={{ marginLeft: 8 }}
            />
          </TouchableOpacity>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill,
                { 
                  width: `${((currentIndex + 1) / onboardingData.length) * 100}%`,
                  backgroundColor: onboardingData[currentIndex]?.color || Colors.primary,
                }
              ]} 
            />
          </View>
          <Text style={styles.progressText}>
            {currentIndex + 1} / {onboardingData.length}
          </Text>
        </View>

        {/* Login Link */}
        <TouchableOpacity 
          style={styles.loginLink}
          onPress={skipToLogin}
        >
          <Text style={styles.loginText}>Already have an account? </Text>
          <Text style={styles.loginLinkText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  skipText: {
    color: Colors.textLight,
    fontSize: 14,
    fontWeight: '500',
  },
  slide: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 100,
  },
  imageContainer: {
    marginBottom: 40,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  icon: {
    fontSize: 50,
  },
  content: {
    paddingHorizontal: 30,
    alignItems: 'center',
  },
  slideNumber: {
    fontSize: 14,
    color: Colors.textLight,
    marginBottom: 8,
    fontWeight: '500',
  },
  slideTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 38,
  },
  slideDescription: {
    fontSize: 20,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '600',
    lineHeight: 28,
  },
  slideSubDescription: {
    fontSize: 16,
    color: Colors.textLight,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 10,
    marginBottom: 30,
  },
  featureDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  featureDot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
    transition: 'all 0.3s ease',
  },
  navigation: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 12,
    minWidth: 150,
    shadowColor: '#2E8B57',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  nextButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  placeholder: {
    width: 80,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginRight: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 14,
    color: Colors.textLight,
    fontWeight: '500',
    minWidth: 40,
  },
  loginLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginText: {
    color: Colors.textLight,
    fontSize: 14,
  },
  loginLinkText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});