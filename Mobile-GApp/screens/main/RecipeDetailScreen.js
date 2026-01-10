import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  Modal,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialIcons, FontAwesome, Feather } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

// Mock recipe data
const mockRecipe = {
  id: '1',
  title: 'Mediterranean Quinoa Bowl',
  category: 'Diabetes-Friendly',
  prepTime: 15,
  cookTime: 20,
  totalTime: 35,
  servings: 2,
  difficulty: 'Easy',
  rating: 4.8,
  reviewCount: 124,
  author: 'Dr. Sarah Miller',
  authorRole: 'Diabetes Nutritionist',
  image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800',
  isBookmarked: true,
  
  description: 'A balanced, diabetes-friendly bowl packed with protein, fiber, and healthy fats. Perfect for blood sugar management.',
  
  nutrition: {
    calories: 420,
    carbs: '45g',
    protein: '22g',
    fat: '18g',
    fiber: '12g',
    sugar: '8g',
  },
  
  ingredients: [
    { id: '1', name: 'Quinoa', amount: '1 cup', owned: true },
    { id: '2', name: 'Chicken breast', amount: '200g', owned: true },
    { id: '3', name: 'Cherry tomatoes', amount: '1 cup', owned: true },
    { id: '4', name: 'Cucumber', amount: '1 medium', owned: true },
    { id: '5', name: 'Red onion', amount: '½ cup', owned: false },
    { id: '6', name: 'Kalamata olives', amount: '¼ cup', owned: false },
    { id: '7', name: 'Feta cheese', amount: '50g', owned: true },
    { id: '8', name: 'Lemon juice', amount: '2 tbsp', owned: true },
    { id: '9', name: 'Olive oil', amount: '1 tbsp', owned: true },
    { id: '10', name: 'Fresh dill', amount: '2 tbsp', owned: false },
  ],
  
  instructions: [
    'Cook quinoa according to package instructions.',
    'Grill chicken breast until fully cooked, then slice.',
    'Dice cucumbers, halve cherry tomatoes, and thinly slice red onion.',
    'Whisk together lemon juice, olive oil, and chopped dill for dressing.',
    'Combine all ingredients in a large bowl and toss with dressing.',
    'Divide into bowls and top with crumbled feta cheese.',
    'Serve immediately or refrigerate for up to 3 days.',
  ],
  
  tips: [
    'Quinoa has a low glycemic index, making it ideal for diabetes management.',
    'Lean protein helps stabilize blood sugar levels.',
    'High fiber content slows carbohydrate absorption.',
    'Healthy fats from olive oil improve insulin sensitivity.',
  ],
};

const RecipeDetailsScreen = () => {
  const navigation = useNavigation();
  const [recipe, setRecipe] = useState(mockRecipe);
  const [showIngredientsModal, setShowIngredientsModal] = useState(false);
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [servings, setServings] = useState(recipe.servings);
  const [expandedTip, setExpandedTip] = useState(null);

  const toggleBookmark = () => {
    setRecipe({ ...recipe, isBookmarked: !recipe.isBookmarked });
  };

  const ownedCount = recipe.ingredients.filter(item => item.owned).length;
  const totalIngredients = recipe.ingredients.length;

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color="#FFF" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.bookmarkButton} onPress={toggleBookmark}>
        <Ionicons
          name={recipe.isBookmarked ? "bookmark" : "bookmark-outline"}
          size={24}
          color="#FFF"
        />
      </TouchableOpacity>
    </View>
  );

  const renderHeroSection = () => (
    <View style={styles.heroContainer}>
      <Image source={{ uri: recipe.image }} style={styles.recipeImage} />
      <View style={styles.imageOverlay}>
        <View style={styles.heroContent}>
          <View style={styles.recipeBadge}>
            <Text style={styles.badgeText}>{recipe.category}</Text>
          </View>
          <View style={styles.nutritionBadge}>
            <View style={styles.nutritionItem}>
              <Text style={styles.nutritionIcon}>🥗</Text>
              <Text style={styles.nutritionValue}>{recipe.nutrition.calories} cal</Text>
            </View>
            <View style={styles.nutritionDivider} />
            <View style={styles.nutritionItem}>
              <Text style={styles.nutritionIcon}>🍞</Text>
              <Text style={styles.nutritionValue}>{recipe.nutrition.carbs} carbs</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  const renderStatsBar = () => (
    <View style={styles.statsBar}>
      <View style={styles.statItem}>
        <Ionicons name="time-outline" size={20} color="#4CAF50" />
        <Text style={styles.statText}>{recipe.totalTime} mins</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <Feather name="users" size={20} color="#4CAF50" />
        <Text style={styles.statText}>Serves {servings}</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <MaterialIcons name="speed" size={20} color="#4CAF50" />
        <Text style={styles.statText}>{recipe.difficulty}</Text>
      </View>
    </View>
  );

  const renderTitleSection = () => (
    <View style={styles.titleSection}>
      <Text style={styles.recipeTitle}>{recipe.title}</Text>
      <Text style={styles.recipeDescription}>{recipe.description}</Text>
      
      <View style={styles.authorRow}>
        <View style={styles.authorAvatar}>
          <Ionicons name="person-circle" size={40} color="#4CAF50" />
        </View>
        <View style={styles.authorInfo}>
          <Text style={styles.authorName}>{recipe.author}</Text>
          <Text style={styles.authorRole}>{recipe.authorRole}</Text>
        </View>
        <View style={styles.ratingContainer}>
          <Ionicons name="star" size={16} color="#FFD700" />
          <Text style={styles.ratingText}>{recipe.rating}</Text>
          <Text style={styles.reviewCount}>({recipe.reviewCount})</Text>
        </View>
      </View>
    </View>
  );

  const renderSafetySection = () => (
    <TouchableOpacity 
      style={styles.safetyCard}
      onPress={() => setShowSafetyModal(true)}
      activeOpacity={0.9}
    >
      <View style={styles.safetyHeader}>
        <View style={styles.safetyIcon}>
          <FontAwesome name="stethoscope" size={20} color="#FFF" />
        </View>
        <View style={styles.safetyTextContainer}>
          <Text style={styles.safetyTitle}>Why This Is Diabetes-Safe</Text>
          <Text style={styles.safetySubtitle}>Expert-approved for blood sugar management</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#4CAF50" />
      </View>
      
      <View style={styles.safetyHighlights}>
        <View style={styles.highlightItem}>
          <Ionicons name="trending-down" size={16} color="#4CAF50" />
          <Text style={styles.highlightText}>Low Glycemic</Text>
        </View>
        <View style={styles.highlightItem}>
          <Ionicons name="leaf" size={16} color="#4CAF50" />
          <Text style={styles.highlightText}>High Fiber</Text>
        </View>
        <View style={styles.highlightItem}>
          <Ionicons name="fitness" size={16} color="#4CAF50" />
          <Text style={styles.highlightText}>Balanced Macros</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderIngredientsSection = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Ingredients</Text>
        <TouchableOpacity 
          style={styles.viewAllButton}
          onPress={() => setShowIngredientsModal(true)}
        >
          <Text style={styles.viewAllText}>View All</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.ingredientsProgress}>
        <View style={styles.progressContainer}>
          <View style={styles.progressLabel}>
            <Text style={styles.progressText}>
              You have: {ownedCount} of {totalIngredients} ingredients
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${(ownedCount / totalIngredients) * 100}%` }
              ]} 
            />
          </View>
        </View>
      </View>
      
      <View style={styles.ingredientsGrid}>
        {recipe.ingredients.slice(0, 6).map((item) => (
          <View key={item.id} style={styles.ingredientCard}>
            <View style={styles.ingredientHeader}>
              {item.owned ? (
                <View style={styles.ownedIndicator}>
                  <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                </View>
              ) : (
                <View style={styles.missingIndicator}>
                  <View style={styles.missingDot} />
                </View>
              )}
              <Text style={styles.ingredientName} numberOfLines={1}>
                {item.name}
              </Text>
            </View>
            <Text style={styles.ingredientAmount}>{item.amount}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderInstructionsSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Instructions</Text>
      
      {recipe.instructions.map((step, index) => (
        <View key={index} style={styles.instructionStep}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>{index + 1}</Text>
          </View>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}
    </View>
  );

  const renderTipsSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Diabetes Management Tips</Text>
      
      <View style={styles.tipsContainer}>
        {recipe.tips.map((tip, index) => (
          <TouchableOpacity
            key={index}
            style={styles.tipCard}
            onPress={() => setExpandedTip(expandedTip === index ? null : index)}
            activeOpacity={0.8}
          >
            <View style={styles.tipHeader}>
              <View style={styles.tipIcon}>
                <Ionicons name="medical" size={18} color="#4CAF50" />
              </View>
              <Text style={styles.tipTitle}>Tip {index + 1}</Text>
              <Ionicons 
                name={expandedTip === index ? "chevron-up" : "chevron-down"} 
                size={18} 
                color="#666" 
              />
            </View>
            {expandedTip === index && (
              <Text style={styles.tipContent}>{tip}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderNutritionSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Nutrition Facts</Text>
      
      <View style={styles.nutritionGrid}>
        <View style={styles.nutritionCard}>
          <Text style={styles.nutritionValue}>{recipe.nutrition.calories}</Text>
          <Text style={styles.nutritionLabel}>Calories</Text>
        </View>
        
        <View style={styles.nutritionCard}>
          <Text style={styles.nutritionValue}>{recipe.nutrition.carbs}</Text>
          <Text style={styles.nutritionLabel}>Carbs</Text>
          <Text style={styles.nutritionSubtext}>
            Fiber: {recipe.nutrition.fiber}
          </Text>
        </View>
        
        <View style={styles.nutritionCard}>
          <Text style={styles.nutritionValue}>{recipe.nutrition.protein}</Text>
          <Text style={styles.nutritionLabel}>Protein</Text>
        </View>
        
        <View style={styles.nutritionCard}>
          <Text style={styles.nutritionValue}>{recipe.nutrition.fat}</Text>
          <Text style={styles.nutritionLabel}>Fat</Text>
        </View>
      </View>
    </View>
  );

  const renderSafetyModal = () => (
    <Modal
      visible={showSafetyModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowSafetyModal(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Diabetes Safety Guide</Text>
            <TouchableOpacity onPress={() => setShowSafetyModal(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalBody}>
            <View style={styles.modalSection}>
              <View style={styles.modalIcon}>
                <Ionicons name="trending-down" size={28} color="#4CAF50" />
              </View>
              <Text style={styles.modalSectionTitle}>Low Glycemic Impact</Text>
              <Text style={styles.modalSectionText}>
                This recipe uses quinoa instead of white rice or pasta, which has a much lower glycemic index. This means it raises blood sugar levels slowly and steadily.
              </Text>
            </View>
            
            <View style={styles.modalDivider} />
            
            <View style={styles.modalSection}>
              <View style={styles.modalIcon}>
                <Ionicons name="leaf" size={28} color="#4CAF50" />
              </View>
              <Text style={styles.modalSectionTitle}>High Fiber Content</Text>
              <Text style={styles.modalSectionText}>
                With {recipe.nutrition.fiber} of fiber, this meal helps slow down carbohydrate absorption and improves blood sugar control.
              </Text>
            </View>
            
            <View style={styles.modalDivider} />
            
            <View style={styles.modalSection}>
              <View style={styles.modalIcon}>
                <Ionicons name="pie-chart" size={28} color="#4CAF50" />
              </View>
              <Text style={styles.modalSectionTitle}>Balanced Macronutrients</Text>
              <Text style={styles.modalSectionText}>
                The perfect balance of protein ({recipe.nutrition.protein}), carbs ({recipe.nutrition.carbs}), and healthy fats ({recipe.nutrition.fat}) supports stable energy levels.
              </Text>
            </View>
            
            <View style={styles.modalDivider} />
            
            <View style={styles.modalSection}>
              <View style={styles.modalIcon}>
                <Ionicons name="time" size={28} color="#4CAF50" />
              </View>
              <Text style={styles.modalSectionTitle}>Portion Control</Text>
              <Text style={styles.modalSectionText}>
                Pre-portioned servings help maintain consistent carbohydrate intake, crucial for diabetes management.
              </Text>
            </View>
          </ScrollView>
          
          <TouchableOpacity 
            style={styles.modalButton}
            onPress={() => setShowSafetyModal(false)}
          >
            <Text style={styles.modalButtonText}>Got It!</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
            <Text style={styles.modalTitle}>All Ingredients</Text>
            <TouchableOpacity onPress={() => setShowIngredientsModal(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalBody}>
            {recipe.ingredients.map((item) => (
              <View key={item.id} style={styles.modalIngredientItem}>
                <View style={styles.modalIngredientInfo}>
                  {item.owned ? (
                    <Ionicons name="checkmark-circle" size={22} color="#4CAF50" />
                  ) : (
                    <View style={styles.modalMissingIcon} />
                  )}
                  <View style={styles.modalIngredientText}>
                    <Text style={styles.modalIngredientName}>{item.name}</Text>
                    <Text style={styles.modalIngredientAmount}>{item.amount}</Text>
                  </View>
                </View>
                <View style={[
                  styles.ownershipBadge,
                  item.owned ? styles.ownedBadge : styles.neededBadge
                ]}>
                  <Text style={[
                    styles.ownershipText,
                    item.owned ? styles.ownedText : styles.neededText
                  ]}>
                    {item.owned ? 'Owned' : 'Need'}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
          
          <TouchableOpacity 
            style={styles.modalButton}
            onPress={() => setShowIngredientsModal(false)}
          >
            <Text style={styles.modalButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {renderHeroSection()}
        {renderHeader()}
        <View style={styles.content}>
          {renderStatsBar()}
          {renderTitleSection()}
          {renderSafetySection()}
          {renderIngredientsSection()}
          {renderInstructionsSection()}
          {renderTipsSection()}
          {renderNutritionSection()}
        </View>
      </ScrollView>
      
      <View style={styles.footer}>
        <TouchableOpacity style={styles.logButton}>
          <Ionicons name="nutrition-outline" size={20} color="#4CAF50" />
          <Text style={styles.logButtonText}>Log Meal</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.cookButton}
          onPress={() => navigation.navigate('StartCooking', { recipe })}
        >
          <Ionicons name="restaurant-outline" size={20} color="#FFF" />
          <Text style={styles.cookButtonText}>Start Cooking</Text>
        </TouchableOpacity>
      </View>
      
      {renderSafetyModal()}
      {renderIngredientsModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  header: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    backdropFilter: 'blur(10px)',
  },
  bookmarkButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    backdropFilter: 'blur(10px)',
  },
  heroContainer: {
    height: 320,
    position: 'relative',
  },
  recipeImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  heroContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  recipeBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 10,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  nutritionBadge: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    padding: 12,
    alignSelf: 'flex-start',
  },
  nutritionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  nutritionIcon: {
    fontSize: 16,
    marginRight: 4,
  },
  nutritionValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  nutritionDivider: {
    width: 1,
    height: '100%',
    backgroundColor: '#E0E0E0',
  },
  content: {
    flex: 1,
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#F8FDF9',
    marginHorizontal: 20,
    marginTop: -20,
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  statText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
    marginLeft: 6,
  },
  statDivider: {
    width: 1,
    height: '100%',
    backgroundColor: '#E8F5E9',
  },
  titleSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  recipeTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 8,
    lineHeight: 34,
  },
  recipeDescription: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 20,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorAvatar: {
    marginRight: 12,
  },
  authorInfo: {
    flex: 1,
  },
  authorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  authorRole: {
    fontSize: 14,
    color: '#4CAF50',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 4,
    marginRight: 4,
  },
  reviewCount: {
    fontSize: 12,
    color: '#666',
  },
  safetyCard: {
    backgroundColor: '#F8FDF9',
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8F5E9',
  },
  safetyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  safetyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  safetyTextContainer: {
    flex: 1,
  },
  safetyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 2,
  },
  safetySubtitle: {
    fontSize: 14,
    color: '#666',
  },
  safetyHighlights: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  highlightItem: {
    alignItems: 'center',
  },
  highlightText: {
    fontSize: 12,
    color: '#4CAF50',
    marginTop: 4,
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1B5E20',
  },
  viewAllButton: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  viewAllText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  ingredientsProgress: {
    marginBottom: 20,
  },
  progressContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
  },
  progressLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
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
  ingredientsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  ingredientCard: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  ingredientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ownedIndicator: {
    marginRight: 8,
  },
  missingIndicator: {
    marginRight: 8,
  },
  missingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF9800',
  },
  ingredientName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  ingredientAmount: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '600',
  },
  instructionStep: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: '#F8FDF9',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  tipsContainer: {
    marginTop: 8,
  },
  tipCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8F5E9',
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tipIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  tipTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  tipContent: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  nutritionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  nutritionCard: {
    width: '48%',
    backgroundColor: '#F8FDF9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8F5E9',
  },
  nutritionValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 4,
  },
  nutritionLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  nutritionSubtext: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  logButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#F1F8E9',
    borderRadius: 12,
    marginRight: 10,
  },
  logButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
    marginLeft: 8,
  },
  cookButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    marginLeft: 10,
  },
  cookButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginLeft: 8,
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
  modalSection: {
    marginBottom: 16,
  },
  modalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  modalSectionText: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 20,
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
  modalIngredientItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  modalIngredientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modalMissingIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#FF9800',
  },
  modalIngredientText: {
    marginLeft: 12,
    flex: 1,
  },
  modalIngredientName: {
    fontSize: 16,
    color: '#333',
    marginBottom: 2,
  },
  modalIngredientAmount: {
    fontSize: 14,
    color: '#666',
  },
  ownershipBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 12,
  },
  ownedBadge: {
    backgroundColor: '#E8F5E9',
  },
  neededBadge: {
    backgroundColor: '#FFF3E0',
  },
  ownershipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  ownedText: {
    color: '#4CAF50',
  },
  neededText: {
    color: '#FF9800',
  },
});

export default RecipeDetailsScreen;
