import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRIMARY = '#4CAF50';

const mockCooking = {
  id: 'mock-1',
  title: 'Mediterranean Chicken Salad',
  nutritionLine: '🥗 350 cal | 🍞 28g carbs',
  steps: [
    {
      title: 'Prep ingredients',
      description: 'Rinse greens, slice tomatoes, cucumbers, and onions.',
      duration: 5,
      image: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=1200&q=80',
      ingredients: ['Mixed greens', 'Cherry tomatoes', 'Cucumber', 'Red onion'],
      equipment: ['Cutting board', 'Chef knife', 'Bowl'],
      diabetesTip: 'Keep vegetable portions generous for fiber.',
      portionTip: 'Aim for 2 cups of greens per serving.',
    },
    {
      title: 'Cook chicken',
      description: 'Season chicken lightly and cook until golden and done.',
      duration: 8,
      image: 'https://images.unsplash.com/photo-1546069901-eacef0df6022?w=1200&q=80',
      ingredients: ['Chicken breast', 'Olive oil', 'Salt', 'Pepper'],
      equipment: ['Skillet', 'Spatula'],
      diabetesTip: 'Lean protein helps stabilize blood sugar.',
      portionTip: 'Use one palm-sized portion per serving.',
    },
    {
      title: 'Mix dressing',
      description: 'Whisk olive oil, lemon juice, and oregano.',
      duration: 3,
      image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&q=80',
      ingredients: ['Olive oil', 'Lemon juice', 'Oregano'],
      equipment: ['Small bowl', 'Whisk'],
      diabetesTip: 'Healthy fats slow glucose absorption.',
      portionTip: 'Use 1 tbsp dressing per serving.',
    },
    {
      title: 'Assemble and serve',
      description: 'Toss vegetables with dressing and top with chicken.',
      duration: 4,
      image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=1200&q=80',
      ingredients: ['Cooked chicken', 'Dressed vegetables'],
      equipment: ['Serving bowl', 'Tongs'],
      diabetesTip: 'Balanced plate supports steady energy.',
      portionTip: 'Half plate veggies, quarter protein.',
    },
  ],
};

const formatTime = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

export default function StartCookingScreen({ navigation, route }) {
  const recipe = route.params?.recipe || mockCooking;
  const steps = recipe.steps ?? mockCooking.steps;
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [timerRunning, setTimerRunning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(steps[0]?.duration * 60 || 0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [showEquipment, setShowEquipment] = useState(false);

  const progress = useMemo(() => {
    if (!steps.length) return 0;
    return completedSteps.length / steps.length;
  }, [completedSteps, steps.length]);

  useEffect(() => {
    const loadProgress = async () => {
      const key = `startCooking:${recipe.id || 'mock'}`;
      const stored = await AsyncStorage.getItem(key);
      if (!stored) return;
      try {
        const parsed = JSON.parse(stored);
        setCurrentStep(parsed.currentStep ?? 0);
        setCompletedSteps(parsed.completedSteps ?? []);
      } catch (error) {
        console.warn('Failed to load cooking progress', error);
      }
    };
    loadProgress();
  }, [recipe.id]);

  useEffect(() => {
    const key = `startCooking:${recipe.id || 'mock'}`;
    AsyncStorage.setItem(
      key,
      JSON.stringify({ currentStep, completedSteps })
    ).catch(() => {});
  }, [currentStep, completedSteps, recipe.id]);

  useEffect(() => {
    setRemainingSeconds((steps[currentStep]?.duration || 0) * 60);
    setTimerRunning(false);
  }, [currentStep, steps]);

  useEffect(() => {
    if (!timerRunning) return;
    if (remainingSeconds <= 0) {
      setTimerRunning(false);
      return;
    }
    const timer = setTimeout(() => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [timerRunning, remainingSeconds]);

  const step = steps[currentStep];
  const isComplete = completedSteps.includes(currentStep);

  const toggleComplete = () => {
    setCompletedSteps((prev) =>
      prev.includes(currentStep) ? prev.filter((s) => s !== currentStep) : [...prev, currentStep]
    );
  };

  const goPrev = () => setCurrentStep((prev) => Math.max(0, prev - 1));
  const goNext = () => setCurrentStep((prev) => Math.min(steps.length - 1, prev + 1));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={PRIMARY} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Start Cooking</Text>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.progressWrap}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          Step {currentStep + 1} of {steps.length}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.nutritionCard}>
          <Text style={styles.nutritionText}>{recipe.nutritionLine}</Text>
        </View>

        <Image source={{ uri: step?.image }} style={styles.stepImage} />

        <View style={styles.stepCard}>
          <View style={styles.stepHeader}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>{currentStep + 1}</Text>
            </View>
            <View style={styles.stepHeaderText}>
              <Text style={styles.stepTitle}>{step?.title}</Text>
              <Text style={styles.stepDescription}>{step?.description}</Text>
            </View>
          </View>

          <View style={styles.timeRow}>
            <Ionicons name="time-outline" size={16} color={PRIMARY} />
            <Text style={styles.timeText}>{step?.duration} min</Text>
            <View style={styles.timerControls}>
              <Text style={styles.timerText}>{formatTime(remainingSeconds)}</Text>
              <TouchableOpacity
                style={styles.timerButton}
                onPress={() => setTimerRunning((prev) => !prev)}
              >
                <Ionicons name={timerRunning ? 'pause' : 'play'} size={14} color="white" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.cardRow}>
            <TouchableOpacity style={styles.cardButton} onPress={() => setShowIngredients(true)}>
              <Ionicons name="list-circle-outline" size={18} color={PRIMARY} />
              <Text style={styles.cardButtonText}>Ingredients</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cardButton} onPress={() => setShowEquipment(true)}>
              <Ionicons name="construct-outline" size={18} color={PRIMARY} />
              <Text style={styles.cardButtonText}>Equipment</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tipCard}>
            <Text style={styles.tipTitle}>Diabetes Tip</Text>
            <Text style={styles.tipText}>{step?.diabetesTip}</Text>
            <Text style={styles.portionText}>Portion: {step?.portionTip}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.navButton, currentStep === 0 && styles.navButtonDisabled]}
          onPress={goPrev}
          disabled={currentStep === 0}
        >
          <Text style={styles.navButtonText}>Previous</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.navButton, styles.completeButton]} onPress={toggleComplete}>
          <Ionicons name={isComplete ? 'checkmark-circle' : 'radio-button-off'} size={18} color="white" />
          <Text style={styles.completeText}>{isComplete ? 'Completed' : 'Mark Complete'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, currentStep === steps.length - 1 && styles.navButtonDisabled]}
          onPress={goNext}
          disabled={currentStep === steps.length - 1}
        >
          <Text style={styles.navButtonText}>Next</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showIngredients} transparent animationType="slide" onRequestClose={() => setShowIngredients(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ingredients</Text>
              <TouchableOpacity onPress={() => setShowIngredients(false)}>
                <Ionicons name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>
            {step?.ingredients?.map((item, idx) => (
              <Text key={`${item}-${idx}`} style={styles.modalItem}>{item}</Text>
            ))}
          </View>
        </View>
      </Modal>

      <Modal visible={showEquipment} transparent animationType="slide" onRequestClose={() => setShowEquipment(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Equipment</Text>
              <TouchableOpacity onPress={() => setShowEquipment(false)}>
                <Ionicons name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>
            {step?.equipment?.map((item, idx) => (
              <Text key={`${item}-${idx}`} style={styles.modalItem}>{item}</Text>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F8E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B5E20',
  },
  progressWrap: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: PRIMARY,
  },
  progressText: {
    marginTop: 8,
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    paddingBottom: 120,
  },
  nutritionCard: {
    marginHorizontal: 20,
    marginTop: 8,
    padding: 12,
    backgroundColor: '#F8FDF9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8F5E9',
  },
  nutritionText: {
    color: '#1B5E20',
    fontWeight: '600',
  },
  stepImage: {
    marginTop: 12,
    marginHorizontal: 20,
    height: 200,
    borderRadius: 16,
  },
  stepCard: {
    marginTop: 16,
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8F5E9',
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepBadgeText: {
    color: 'white',
    fontWeight: '700',
  },
  stepHeaderText: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 6,
  },
  stepDescription: {
    color: '#555',
    lineHeight: 20,
  },
  timeRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeText: {
    color: '#4CAF50',
    fontWeight: '600',
    marginLeft: 6,
    flex: 1,
  },
  timerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timerText: {
    color: '#1B5E20',
    fontWeight: '600',
  },
  timerButton: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cardButton: {
    flex: 1,
    backgroundColor: '#F1F8E9',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  cardButtonText: {
    color: '#1B5E20',
    fontWeight: '600',
    fontSize: 12,
  },
  tipCard: {
    marginTop: 16,
    backgroundColor: '#F8FDF9',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E8F5E9',
  },
  tipTitle: {
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 6,
  },
  tipText: {
    color: '#555',
    marginBottom: 6,
  },
  portionText: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    flexDirection: 'row',
    gap: 8,
  },
  navButton: {
    flex: 1,
    backgroundColor: '#F1F8E9',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    color: '#1B5E20',
    fontWeight: '600',
  },
  completeButton: {
    backgroundColor: PRIMARY,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  completeText: {
    color: 'white',
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B5E20',
  },
  modalItem: {
    paddingVertical: 6,
    color: '#555',
  },
});
