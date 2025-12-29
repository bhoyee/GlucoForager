export const formatNutrition = (nutrition) => {
  if (!nutrition) return 'Nutrition unavailable';
  const { calories, carbs } = nutrition;
  return `Calories: ${calories ?? 0} | Carbs: ${carbs ?? 0}g`;
};

export const formatMissingItems = (missing) => {
  if (!missing?.length) return 'You have everything you need';
  return `+ Needs ${missing.join(', ')}`;
};
