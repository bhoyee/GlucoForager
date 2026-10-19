// utils/afterMealCheck.js
// "Time for a glucose check" reminder, 2 hours after a logged meal. Scheduled on the
// phone (no server), so it works offline and costs nothing. Each reading logged after a
// meal is what powers the meal diary pairing and Food impact insights.
//
// Rules: needs only the phone's notification permission and this reminder's own switch
// (Profile > After-meal glucose check) - not the general "Enable notifications" switch,
// which also turns on the 3-a-day meal reminders. One pending reminder at a time (the
// latest meal); never between 10pm and 7am; at most 3 a day; cancelled as soon as a
// reading is logged. The permission is asked for in context, after a meal is logged.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const AFTER_MEAL_CHECK_TYPE = 'after_meal_check';
const ANDROID_CHANNEL_ID = 'after-meal-check';
const KEYS = {
  enabled: 'after_meal_check_enabled_v1', // '0' = off; anything else = on (default on)
  pending: 'after_meal_check_pending_v1', // { id, fireAt }
  daily: 'after_meal_check_daily_v1', // { day, count }
  asked: 'after_meal_check_asked_v1', // '1' once we've offered it
};
const DELAY_MS = 2 * 60 * 60 * 1000;
const MIN_LEAD_MS = 5 * 60 * 1000; // a meal logged late enough that the check is due now: skip
const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 7;
const MAX_PER_DAY = 3;

const readJson = async (key, fallback) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = async (key, value) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Non-fatal.
  }
};
const localDay = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export async function getAfterMealCheckEnabled() {
  try {
    return (await AsyncStorage.getItem(KEYS.enabled)) !== '0';
  } catch {
    return true;
  }
}

export async function setAfterMealCheckEnabled(enabled) {
  try {
    await AsyncStorage.setItem(KEYS.enabled, enabled ? '1' : '0');
  } catch {
    // Non-fatal.
  }
  if (!enabled) await cancelAfterMealCheck();
}

export async function cancelAfterMealCheck() {
  const pending = await readJson(KEYS.pending, null);
  if (pending?.id) {
    try {
      await Notifications.cancelScheduledNotificationAsync(pending.id);
    } catch {
      // Already fired or gone.
    }
  }
  await writeJson(KEYS.pending, null);
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'After-meal glucose checks',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
      vibrationPattern: null,
      enableVibrate: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {
    // Non-fatal.
  }
}

/** Decide whether a meal eaten at `mealTime` should get a reminder, and when. */
export function planAfterMealCheck(mealTime, now = new Date(), countToday = 0) {
  const fireAt = new Date(mealTime.getTime() + DELAY_MS);
  if (fireAt.getTime() - now.getTime() < MIN_LEAD_MS) return { skip: 'too_late' };
  const hour = fireAt.getHours();
  if (hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR) return { skip: 'quiet_hours' };
  if (countToday >= MAX_PER_DAY) return { skip: 'daily_cap' };
  return { fireAt };
}

/** Called after a meal is saved. `loggedAt` is when the meal was eaten (server time).
 * Returns when the reminder will fire (a Date), or null if none was scheduled. */
export async function scheduleAfterMealCheck({ description, loggedAt }) {
  try {
    if (!(await getAfterMealCheckEnabled())) return null;
    const perms = await Notifications.getPermissionsAsync();
    if (!perms?.granted) return null;

    const mealTime = loggedAt instanceof Date ? loggedAt : new Date(loggedAt || Date.now());
    const now = new Date();
    const daily = await readJson(KEYS.daily, null);
    const plan = planAfterMealCheck(mealTime, now, daily?.day === localDay(mealTime) ? daily.count : 0);
    if (!plan.fireAt) return null;

    // One at a time: a newer meal replaces the older meal's reminder.
    await cancelAfterMealCheck();
    await ensureChannel();
    const name = (description || '').trim();
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Time for a glucose check',
        body: name ? `See how ${name.length > 60 ? `${name.slice(0, 57)}...` : name} affected you.` : 'See how your meal affected you.',
        data: { type: AFTER_MEAL_CHECK_TYPE },
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: plan.fireAt,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
    });
    await writeJson(KEYS.pending, { id, fireAt: plan.fireAt.toISOString() });
    const day = localDay(plan.fireAt);
    await writeJson(KEYS.daily, { day, count: (daily?.day === day ? daily.count : 0) + 1 });
    return plan.fireAt;
  } catch {
    return null; // A reminder is a nice-to-have; never block logging a meal.
  }
}

/** Asks for notification permission (system prompt). Returns true if granted. */
export async function requestAfterMealCheckPermission() {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing?.granted) return true;
    const asked = await Notifications.requestPermissionsAsync(
      Platform.OS === 'ios' ? { ios: { allowAlert: true, allowBadge: false, allowSound: false } } : undefined
    );
    return Boolean(asked?.granted);
  } catch {
    return false;
  }
}

/**
 * Call after any meal is saved. With permission it just schedules the reminder; without
 * it, the first time a meal would actually get one, it offers the reminder in context
 * (people say yes far more often when the reason is right in front of them).
 */
// Returns { status: 'scheduled', fireAt } | { status: 'asked' } (permission question shown)
// | { status: 'none' }, so the caller can tell the user what happens next.
export async function afterMealLogged(meal) {
  const none = { status: 'none' };
  try {
    if (!(await getAfterMealCheckEnabled())) return none;
    const perms = await Notifications.getPermissionsAsync();
    if (perms?.granted) {
      const fireAt = await scheduleAfterMealCheck(meal);
      return fireAt ? { status: 'scheduled', fireAt } : none;
    }
    if (perms?.canAskAgain === false) return none;
    if ((await AsyncStorage.getItem(KEYS.asked)) === '1') return none;
    const mealTime = new Date(meal.loggedAt || Date.now());
    if (!planAfterMealCheck(mealTime).fireAt) return none; // wait for a meal that would get one
    await AsyncStorage.setItem(KEYS.asked, '1');
    Alert.alert(
      'Want a reminder in 2 hours?',
      "We'll remind you to check your glucose so you can see how this meal affected you.",
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Yes, remind me',
          onPress: async () => {
            if (await requestAfterMealCheckPermission()) await scheduleAfterMealCheck(meal);
          },
        },
      ]
    );
    return { status: 'asked' };
  } catch {
    return none; // Never block logging a meal.
  }
}

/** On only when the user hasn't switched it off AND the phone allows notifications. */
export async function getAfterMealCheckActive() {
  if (!(await getAfterMealCheckEnabled())) return false;
  try {
    return Boolean((await Notifications.getPermissionsAsync())?.granted);
  } catch {
    return false;
  }
}
