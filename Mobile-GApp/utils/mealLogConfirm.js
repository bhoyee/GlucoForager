// utils/mealLogConfirm.js
// After a meal is saved (typed, or "I ate this" on a recipe): set up the 2-hour glucose
// reminder and tell the person what happens next - the carbs counted and when to check.
import { Alert } from 'react-native';
import { afterMealLogged } from './afterMealCheck';

const formatTime = (date) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);

export async function confirmMealLogged({ name, description, loggedAt, carbs, carbsEstimated }) {
  const reminder = await afterMealLogged({ description: description || name, loggedAt });
  if (reminder.status === 'asked') return; // the reminder question is already on screen
  const carbsLine = carbs != null ? `${carbsEstimated ? 'About ' : ''}${Math.round(carbs)}g carbs added to today.` : '';
  const checkLine =
    reminder.status === 'scheduled'
      ? `We'll remind you to check your glucose around ${formatTime(reminder.fireAt)}.`
      : 'Check your glucose about 2 hours after eating to see how this meal affected you.';
  Alert.alert(`Logged: ${name}`, [carbsLine, checkLine].filter(Boolean).join('\n\n'));
}
