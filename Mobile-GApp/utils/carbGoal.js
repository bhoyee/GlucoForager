// utils/carbGoal.js
// Shared text logic for the carb goal ring, used by both the Home screen summary
// and the full Carb Goal screen so the two never drift apart.

export function getCarbGoalTitle({ carbsLoggedToday, carbGoalToday, carbGoalMode, mealsLoggedToday }) {
  if (carbsLoggedToday == null) {
    return mealsLoggedToday > 0
      ? `${mealsLoggedToday} meal${mealsLoggedToday === 1 ? '' : 's'} logged today`
      : 'No carbs logged yet today';
  }
  if (carbGoalMode === 'none') return `${carbsLoggedToday}g carbs logged today`;
  return `${carbsLoggedToday}g of ${carbGoalToday}g carbs today`;
}

export function getCarbGoalSubtitle({ carbsLoggedToday, carbGoalToday, carbGoalMode }) {
  if (carbsLoggedToday == null) {
    return carbGoalMode === 'none'
      ? 'Carb counting is personal to your insulin plan'
      : 'Scan a barcode or photo to track carbs';
  }
  if (carbGoalMode === 'none') return 'No fixed daily target - match this to your insulin plan';
  if (carbGoalMode === 'floor') {
    return carbsLoggedToday >= carbGoalToday
      ? "You've reached your daily minimum"
      : `${Math.round((carbGoalToday - carbsLoggedToday) * 10) / 10}g to reach your minimum`;
  }
  if (carbsLoggedToday > carbGoalToday) {
    return `${Math.round((carbsLoggedToday - carbGoalToday) * 10) / 10}g over your goal`;
  }
  if (carbsLoggedToday >= 0.85 * carbGoalToday) return 'Getting close to your goal';
  return 'On track for today';
}

export function getCarbGoalDisclaimer(carbGoalMode, carbGoalToday) {
  if (carbGoalMode === 'none') {
    return "Type 1 diabetes doesn't have a single daily carb ceiling - carbs are typically counted per meal against your insulin dose. Check with your doctor or diabetes care team for guidance specific to your plan.";
  }
  if (carbGoalMode === 'floor') {
    return `${carbGoalToday}g/day is a general starting point for pregnancy, not medical advice. Your ideal daily carb range depends on your specific care plan - check with your doctor or diabetes care team to set a target that's right for you.`;
  }
  return `${carbGoalToday}g/day is a general starting point, not medical advice. Your ideal daily carb range depends on your specific diagnosis and treatment - check with your doctor or diabetes care team to set a target that's right for you.`;
}
