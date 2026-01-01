export const formatNutrition = (nutrition) => {
  if (!nutrition) return 'Nutrition unavailable';
  const { calories, carbs } = nutrition;
  const caloriesText = calories != null ? calories : 'n/a';
  const carbsText = carbs != null ? `${carbs}g` : 'n/a';
  return `Calories: ${caloriesText} | Carbs: ${carbsText}`;
};

export const formatMissingItems = (missing) => {
  if (!missing?.length) return 'You have everything you need';
  return `+ Needs ${missing.join(', ')}`;
};
