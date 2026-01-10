import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Animated,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

// Mock cooking data
const cookingData = {
  recipeId: '1',
  recipeName: 'Mediterranean Quinoa Bowl',
  totalSteps: 7,
  totalTime: 35,
  currentStepIndex: 0,
  steps: [
    {
      id: '1',
      title: 'Cook Quinoa',
      description: 'Rinse 1 cup of quinoa under cold water. Add to a saucepan with 2 cups of water and bring to a boil. Reduce heat, cover, and simmer for 15 minutes.',
      duration: 15,
      image: 'https://images.unsplash.com/photo-1592417817098-8fd3d9eb14a5?w=400',
      ingredients: ['Quinoa (1 cup)', 'Water (2 cups)'],
      tip: 'Quinoa has a low glycemic index - perfect for stable blood sugar levels.',
      equipment: ['Saucepan', 'Strainer'],
    },
    {
      id: '2',
      title: 'Prepare Chicken',
      description: 'Season chicken breast with salt, pepper, and oregano. Grill for 6-7 minutes per side until internal temperature reaches 165°F (74°C).',
      duration: 15,
      image: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?w=400',
      ingredients: ['Chicken breast (200g)', 'Salt & pepper', 'Oregano (1 tsp)'],
      tip: 'Lean protein helps maintain stable blood sugar throughout the day.',
      equipment: ['Grill pan', 'Tongs'],
    },
    {
      id: '3',
      title: 'Chop Vegetables',
      description: 'Dice 1 cucumber, halve 1 cup of cherry tomatoes, and thinly slice ½ red onion.',
      duration: 5,
      image: 'https://images.unsplash.com/photo-1566385101042-1a0f0c126c96?w=400',
      ingredients: ['Cucumber', 'Cherry tomatoes (1 cup)', 'Red onion (½)'],
      tip: 'Non-starchy vegetables have minimal impact on blood glucose.',
      equipment: ['Cutting board', 'Chef knife'],
    },
    {
      id: '4',
      title: 'Make Dressing',
      description: 'Whisk together 2 tbsp lemon juice, 1 tbsp olive oil, and chopped fresh dill. Season with salt and pepper.',
      duration: 3,
      image: 'https://images.unsplash.com/photo-1472476443507-c7a5948772fc?w=400',
      ingredients: ['Lemon juice (2 tbsp)', 'Olive oil (1 tbsp)', 'Fresh dill (2 tbsp)'],
      tip: 'Healthy fats from olive oil improve insulin sensitivity.',
      equipment: ['Small bowl', 'Whisk'],
    },
    {
      id: '5',
      title: 'Combine Salad',
      description: 'In a large bowl, mix cooked quinoa, chopped vegetables, and sliced olives.',
      duration: 2,
      image: 'https://images.unsplash.com/photo-1505253716362-afaea1d3d1af?w=400',
      ingredients: ['Cooked quinoa', 'Chopped vegetables', 'Kalamata olives (¼ cup)'],
      tip: 'High fiber content helps slow carbohydrate absorption.',
      equipment: ['Large mixing bowl'],
    },
    {
      id: '6',
      title: 'Add Protein & Cheese',
      description: 'Slice grilled chicken and add to the bowl along with crumbled feta cheese.',
      duration: 2,
      image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
      ingredients: ['Grilled chicken', 'Feta cheese (50g)'],
      tip: 'Balanced plate: ½ non-starchy veggies, ¼ protein, ¼ complex carbs.',
      equipment: ['None'],
    },
    {
      id: '7',
      title: 'Final Assembly',
      description: 'Drizzle dressing over the salad, toss gently to combine, and divide into serving bowls.',
      duration: 3,
      image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400',
      ingredients: ['Salad dressing'],
      tip: 'Portion control is key for diabetes management. This recipe makes exactly 2 servings.',
      equipment: ['Serving bowls', 'Salad tongs'],
    },
  ],
  nutritionPerServing: {
    calories: 420,
    carbs: '45g',
    protein: '22g',
    fat: '18g',
  },
};

const StartCookingScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [showIngredientsModal, setShowIngredientsModal] = useState(false);
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [showDiabeticTips, setShowDiabeticTips] = useState(true);
  const [completedSteps, setCompletedSteps] = useState([]);
  const progressAnim = new Animated.Value(0);

  const currentStepData = cookingData.steps[currentStep];

  // Animation for progress
  useEffect(() => {
    const progress = (currentStep / cookingData.steps.length) * 100;
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [currentStep]);

  // Timer functionality
  useEffect(() => {
    let interval;
    if (timerActive && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setTimerActive(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive, timeRemaining]);

  const startTimer = (minutes) => {
    setTimeRemaining(minutes * 60);
    setTimerActive(true);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const goToNextStep = () => {
    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps([...completedSteps, currentStep]);
    }
    
    if (currentStep < cookingData.steps.length - 1) {
      setCurrentStep(currentStep + 1);
      setTimerActive(false);
    } else {
      // All steps completed
      navigation.navigate('CookingComplete', {
        recipeName: cookingData.recipeName,
        totalTime: cookingData.totalTime,
      });
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setTimerActive(false);
    }
  };

  const markStepComplete = () => {
    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps([...completedSteps, currentStep]);
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity 
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={24} color="#333" />
      </TouchableOpacity>
      
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          Step {currentStep + 1} of {cookingData.steps.length}
        </Text>
        <View style={styles.progressBar}>
          <Animated.View 
            style={[
              styles.progressFill,
              { width: progressAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%']
              })}
            ]} 
          />
        </View>
      </View>
      
      <TouchableOpacity style={styles.timerIcon}>
        <Ionicons name="timer-outline" size={24} color="#333" />
      </TouchableOpacity>
    </View>
  );

  const renderStepCard = () => (
    <View style={styles.stepCard}>
      <View style={styles.stepNumberContainer}>
        <View style={styles.stepNumber}>
          <Text style={styles.stepNumberText}>{currentStep + 1}</Text>
        </View>
        <Text style={styles.stepTitle}>{currentStepData.title}</Text>
      </View>
      
      <Text style={styles.stepDescription}>{currentStepData.description}</Text>
      
      <View style={styles.timeContainer}>
        <View style={styles.timeBadge}>
          <Ionicons name="time-outline" size={16} color="#4CAF50" />
          <Text style={styles.timeText}>{currentStepData.duration} min</Text>
        </View>
        
        {currentStepData.duration > 2 && (
          <TouchableOpacity 
            style={styles.timerButton}
            onPress={() => startTimer(currentStepData.duration)}
          >
            <Ionicons name="timer-outline" size={20} color="#4CAF50" />
            <Text style={styles.timerButtonText}>Set Timer</Text>
          </TouchableOpacity>
        )}
      </View>
      
      {timerActive && (
        <View style={styles.activeTimerContainer}>
          <Text style={styles.timerLabel}>Timer Running:</Text>
          <Text style={styles.timerDisplay}>{formatTime(timeRemaining)}</Text>
          <TouchableOpacity 
            style={styles.stopTimerButton}
            onPress={() => setTimerActive(false)}
          >
            <Text style={styles.stopTimerText}>Stop Timer</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderIngredients = () => (
    <TouchableOpacity 
      style={styles.infoCard}
      onPress={() => setShowIngredientsModal(true)}
      activeOpacity={0.9}
    >
      <View style={styles.infoCardHeader}>
        <View style={styles.infoIcon}>
          <Ionicons name="restaurant-outline" size={20} color="#4CAF50" />
        </View>
        <Text style={styles.infoCardTitle}>Ingredients Needed</Text>
        <Ionicons name="chevron-forward" size={20} color="#999" />
      </View>
      
      <View style={styles.ingredientsList}>
        {currentStepData.ingredients.slice(0, 3).map((ingredient, index) => (
          <View key={index} style={styles.ingredientItem}>
            <View style={styles.ingredientDot} />
            <Text style={styles.ingredientText}>{ingredient}</Text>
          </View>
        ))}
        {currentStepData.ingredients.length > 3 && (
          <Text style={styles.moreText}>+{currentStepData.ingredients.length - 3} more</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderEquipment = () => (
    <TouchableOpacity 
      style={styles.infoCard}
      onPress={() => setShowEquipmentModal(true)}
      activeOpacity={0.9}
    >
      <View style={styles.infoCardHeader}>
        <View style={styles.infoIcon}>
          <MaterialIcons name="kitchen" size={20} color="#4CAF50" />
        </View>
        <Text style={styles.infoCardTitle}>Equipment Required</Text>
        <Ionicons name="chevron-forward" size={20} color="#999" />
      </View>
      
      <View style={styles.equipmentList}>
        {currentStepData.equipment.map((item, index) => (
          <View key={index} style={styles.equipmentItem}>
            <View style={styles.equipmentDot} />
            <Text style={styles.equipmentText}>{item}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );

  const renderDiabeticTip = () => (
    <View style={styles.tipCard}>
      <View style={styles.tipHeader}>
        <View style={styles.tipIcon}>
          <Ionicons name="medical" size={20} color="#FFF" />
        </View>
        <Text style={styles.tipTitle}>Diabetes Management Tip</Text>
        <TouchableOpacity onPress={() => setShowDiabeticTips(!showDiabeticTips)}>
          <Ionicons 
            name={showDiabeticTips ? "chevron-up" : "chevron-down"} 
            size={20} 
            color="#4CAF50" 
          />
        </TouchableOpacity>
      </View>
      
      {showDiabeticTips && (
        <Text style={styles.tipContent}>{currentStepData.tip}</Text>
      )}
    </View>
  );

  const renderStepImage = () => (
    <View style={styles.imageContainer}>
      <Image 
        source={{ uri: currentStepData.image }} 
        style={styles.stepImage}
        resizeMode="cover"
      />
      <View style={styles.imageOverlay}>
        <Text style={styles.imageCaption}>Step {currentStep + 1}: {currentStepData.title}</Text>
      </View>
    </View>
  );

  const renderNavigation = (bottomInset = 0) => (
    <View style={[styles.navigationContainer, { paddingBottom: Math.max(16, bottomInset + 12) }]}>
      <TouchableOpacity 
        style={[
          styles.navButton,
          styles.prevButton,
          currentStep === 0 && styles.disabledButton
        ]}
        onPress={goToPreviousStep}
        disabled={currentStep === 0}
      >
        <Ionicons 
          name="arrow-back" 
          size={20} 
          color={currentStep === 0 ? "#999" : "#4CAF50"} 
        />
        <Text style={[
          styles.navButtonText,
          styles.prevButtonText,
          currentStep === 0 && styles.disabledText
        ]}>
          Previous
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.completeButton}
        onPress={markStepComplete}
      >
        <Ionicons 
          name={completedSteps.includes(currentStep) ? "checkmark-circle" : "checkmark-circle-outline"} 
          size={20} 
          color="#FFF" 
        />
        <Text style={styles.completeButtonText}>
          {completedSteps.includes(currentStep) ? 'Step Complete' : 'Mark Complete'}
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.nextButton}
        onPress={goToNextStep}
      >
        <Text style={styles.nextButtonText}>
          {currentStep === cookingData.steps.length - 1 ? 'Finish Cooking' : 'Next Step'}
        </Text>
        <Ionicons 
          name="arrow-forward" 
          size={20} 
          color="#FFF" 
        />
      </TouchableOpacity>
    </View>
  );

  const renderIngredientsModal = () => (
    <Modal
      visible={showIngredientsModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowIngredientsModal(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Ingredients for Step {currentStep + 1}</Text>
            <TouchableOpacity onPress={() => setShowIngredientsModal(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalBody}>
            {currentStepData.ingredients.map((ingredient, index) => (
              <View key={index} style={styles.modalIngredientItem}>
                <View style={styles.modalIngredientDot} />
                <Text style={styles.modalIngredientText}>{ingredient}</Text>
              </View>
            ))}
          </ScrollView>
          
          <TouchableOpacity 
            style={styles.modalButton}
            onPress={() => setShowIngredientsModal(false)}
          >
            <Text style={styles.modalButtonText}>Got It!</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderEquipmentModal = () => (
    <Modal
      visible={showEquipmentModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowEquipmentModal(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Equipment for Step {currentStep + 1}</Text>
            <TouchableOpacity onPress={() => setShowEquipmentModal(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalBody}>
            {currentStepData.equipment.map((item, index) => (
              <View key={index} style={styles.modalEquipmentItem}>
                <View style={styles.modalEquipmentIcon}>
                  <MaterialIcons name="check" size={20} color="#4CAF50" />
                </View>
                <Text style={styles.modalEquipmentText}>{item}</Text>
              </View>
            ))}
          </ScrollView>
          
          <TouchableOpacity 
            style={styles.modalButton}
            onPress={() => setShowEquipmentModal(false)}
          >
            <Text style={styles.modalButtonText}>All Set!</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: Math.max(120, insets.bottom + 120) }}
        showsVerticalScrollIndicator={false}
      >
        {renderStepImage()}
        {renderStepCard()}
        {renderIngredients()}
        {renderEquipment()}
        {renderDiabeticTip()}
        
        <View style={styles.nutritionCard}>
          <Text style={styles.nutritionTitle}>Nutrition Per Serving</Text>
          <View style={styles.nutritionGrid}>
            <View style={styles.nutritionItem}>
              <Text style={styles.nutritionValue}>{cookingData.nutritionPerServing.calories}</Text>
              <Text style={styles.nutritionLabel}>Calories</Text>
            </View>
            <View style={styles.nutritionItem}>
              <Text style={styles.nutritionValue}>{cookingData.nutritionPerServing.carbs}</Text>
              <Text style={styles.nutritionLabel}>Carbs</Text>
            </View>
            <View style={styles.nutritionItem}>
              <Text style={styles.nutritionValue}>{cookingData.nutritionPerServing.protein}</Text>
              <Text style={styles.nutritionLabel}>Protein</Text>
            </View>
            <View style={styles.nutritionItem}>
              <Text style={styles.nutritionValue}>{cookingData.nutritionPerServing.fat}</Text>
              <Text style={styles.nutritionLabel}>Fat</Text>
            </View>
          </View>
        </View>
      </ScrollView>
      
      {renderNavigation(insets.bottom)}
      
      {renderIngredientsModal()}
      {renderEquipmentModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FDF9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    flex: 1,
    marginHorizontal: 16,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
    marginBottom: 4,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 3,
  },
  timerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  imageContainer: {
    height: 240,
    position: 'relative',
  },
  stepImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  imageCaption: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  stepCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  stepNumberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1B5E20',
    flex: 1,
  },
  stepDescription: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
    marginBottom: 20,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
    marginLeft: 6,
  },
  timerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  timerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
    marginLeft: 6,
  },
  activeTimerContainer: {
    backgroundColor: '#F1F8E9',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  timerLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  timerDisplay: {
    fontSize: 32,
    fontWeight: '700',
    color: '#2E7D32',
    marginBottom: 12,
  },
  stopTimerButton: {
    backgroundColor: '#FFF',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  stopTimerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  infoCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoCardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  ingredientsList: {
    marginLeft: 8,
  },
  ingredientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ingredientDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 12,
  },
  ingredientText: {
    fontSize: 15,
    color: '#333',
  },
  equipmentList: {
    marginLeft: 8,
  },
  equipmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  equipmentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 12,
  },
  equipmentText: {
    fontSize: 15,
    color: '#333',
  },
  moreText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
    marginTop: 4,
  },
  tipCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tipIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  tipTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#1B5E20',
  },
  tipContent: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  nutritionCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 100,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  nutritionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 16,
    textAlign: 'center',
  },
  nutritionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  nutritionItem: {
    width: '48%',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 12,
    backgroundColor: '#F8FDF9',
    borderRadius: 12,
  },
  nutritionValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2E7D32',
    marginBottom: 4,
  },
  nutritionLabel: {
    fontSize: 14,
    color: '#666',
  },
  navigationContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 5,
  },
  navButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  prevButton: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  disabledButton: {
    borderColor: '#E0E0E0',
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  prevButtonText: {
    color: '#4CAF50',
  },
  disabledText: {
    color: '#999',
  },
  completeButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  completeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    marginLeft: 8,
  },
  nextButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E7D32',
    paddingVertical: 14,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  nextButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    marginRight: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1B5E20',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalIngredientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  modalIngredientDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    marginRight: 16,
  },
  modalIngredientText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  modalEquipmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  modalEquipmentIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  modalEquipmentText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  modalButton: {
    backgroundColor: '#4CAF50',
    marginHorizontal: 20,
    marginVertical: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
});

export default StartCookingScreen;
