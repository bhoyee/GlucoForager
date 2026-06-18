import React, { useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';

const { width } = Dimensions.get('window');

const onboardingData = [
  {
    id: '1',
    icon: 'calendar',
    title: 'Plan your day with less guesswork',
    description: 'Get diabetes-friendly meal ideas, tips, and daily challenges.',
    subDescription:
      'GlucoForager helps you decide what to eat for breakfast, lunch, dinner, and snacks.',
    color: Colors.primary,
    chips: ['Meal planner', 'Daily tips', 'Challenges'],
  },
  {
    id: '2',
    icon: 'scan',
    title: 'Use what you already have',
    description: 'Scan your fridge or type ingredients by hand.',
    subDescription:
      'Review detected foods, add missing items, and let the app focus on diabetes-friendlier choices.',
    color: '#3182CE',
    chips: ['Scan fridge', 'Type ingredients', 'Review foods'],
  },
  {
    id: '3',
    icon: 'swap-horizontal',
    title: 'Swap foods with confidence',
    description: 'Find better options for meals, snacks, and drinks.',
    subDescription:
      'Keep familiar foods in your life while making choices that are easier on blood sugar.',
    color: '#0EA5A4',
    chips: ['Food swaps', 'Safer choices', 'Practical tips'],
  },
  {
    id: '4',
    icon: 'sparkles',
    title: 'Ask GlucoGuide AI',
    description: 'Get simple guidance when you are unsure what to eat.',
    subDescription:
      'Start with a 7-day Premium trial for scans, typed ingredients, swaps, planning, favorites, and GlucoGuide AI.',
    color: '#ED8936',
    chips: ['GlucoGuide AI', '7-day trial', 'Premium access'],
  },
];

export default function OnboardingScreen() {
  const navigation = useNavigation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef(null);

  const markOnboardingComplete = async () => {
    await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
    await AsyncStorage.setItem('hasSeenOnboarding', 'true');
  };

  const goToLogin = async () => {
    try {
      await markOnboardingComplete();
    } catch (error) {
      console.error('Error completing onboarding:', error);
    } finally {
      navigation.navigate('Login');
    }
  };

  const goToNext = () => {
    if (currentIndex < onboardingData.length - 1) {
      const nextIndex = currentIndex + 1;
      flatListRef.current?.scrollToIndex({ index: nextIndex });
      setCurrentIndex(nextIndex);
      return;
    }
    goToLogin();
  };

  const goToPrevious = () => {
    if (currentIndex <= 0) return;
    const previousIndex = currentIndex - 1;
    flatListRef.current?.scrollToIndex({ index: previousIndex });
    setCurrentIndex(previousIndex);
  };

  const renderItem = ({ item }) => (
    <View style={[styles.slide, { width }]}>
      <View
        style={[
          styles.visualCard,
          { borderColor: `${item.color}25`, shadowColor: item.color },
        ]}
      >
        <View style={[styles.visualAccent, { backgroundColor: `${item.color}12` }]} />
        <View style={[styles.visualRing, { borderColor: `${item.color}20` }]} />
        <View style={[styles.iconCircle, { backgroundColor: item.color }]}>
          <Ionicons name={item.icon} size={38} color="white" />
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.kicker}>GlucoForager</Text>
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideDescription}>{item.description}</Text>
        <Text style={styles.slideSubDescription}>{item.subDescription}</Text>

        <View style={styles.chipRow}>
          {item.chips.map((chip) => (
            <View
              key={chip}
              style={[
                styles.chip,
                { borderColor: `${item.color}35`, backgroundColor: `${item.color}10` },
              ]}
            >
              <Text style={[styles.chipText, { color: item.color }]}>{chip}</Text>
            </View>
          ))}
        </View>

        <View style={styles.featureDots}>
          {onboardingData.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.featureDot,
                {
                  backgroundColor: idx === currentIndex ? item.color : '#E2E8F0',
                  width: idx === currentIndex ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skipButton} onPress={goToLogin} activeOpacity={0.85}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={onboardingData}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        keyExtractor={(item) => item.id}
        onScroll={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
      />

      <View style={styles.navigation}>
        <View style={styles.buttonContainer}>
          {currentIndex > 0 ? (
            <TouchableOpacity style={styles.backButton} onPress={goToPrevious} activeOpacity={0.85}>
              <Ionicons name="arrow-back" size={20} color={Colors.primary} />
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.placeholder} />
          )}

          <TouchableOpacity style={styles.nextButton} onPress={goToNext} activeOpacity={0.88}>
            <Text style={styles.nextButtonText}>
              {currentIndex === onboardingData.length - 1 ? 'Get Started' : 'Next'}
            </Text>
            <Ionicons
              name={currentIndex === onboardingData.length - 1 ? 'checkmark-circle' : 'arrow-forward'}
              size={20}
              color="white"
              style={styles.nextButtonIcon}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${((currentIndex + 1) / onboardingData.length) * 100}%`,
                  backgroundColor: onboardingData[currentIndex]?.color || Colors.primary,
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {currentIndex + 1} / {onboardingData.length}
          </Text>
        </View>

        <TouchableOpacity style={styles.loginLink} onPress={goToLogin} activeOpacity={0.85}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <Text style={styles.loginLinkText}>Sign In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.premiumDetailsLink}
          onPress={() => navigation.navigate('PremiumDetails')}
          activeOpacity={0.85}
        >
          <Text style={styles.premiumDetailsText}>See Premium details</Text>
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
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  skipText: {
    color: Colors.textLight,
    fontSize: 14,
    fontWeight: '700',
  },
  slide: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 92,
  },
  visualCard: {
    width: 136,
    height: 136,
    borderRadius: 34,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 30,
  },
  visualAccent: {
    position: 'absolute',
    top: -44,
    right: -42,
    width: 124,
    height: 124,
    borderRadius: 62,
  },
  visualRing: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 32,
    borderWidth: 1,
  },
  iconCircle: {
    width: 78,
    height: 78,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
  content: {
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  kicker: {
    fontSize: 12,
    color: Colors.primary,
    marginBottom: 10,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  slideTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 36,
  },
  slideDescription: {
    fontSize: 18,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: '800',
    lineHeight: 25,
  },
  slideSubDescription: {
    fontSize: 15,
    color: Colors.textLight,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 10,
    marginBottom: 22,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
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
  },
  navigation: {
    paddingHorizontal: 20,
    paddingBottom: 64,
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 14,
    minWidth: 150,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  nextButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
  },
  nextButtonIcon: {
    marginLeft: 8,
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
    fontWeight: '600',
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
    fontWeight: '800',
  },
  premiumDetailsLink: {
    marginTop: 10,
    alignSelf: 'center',
    paddingVertical: 6,
  },
  premiumDetailsText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
});
