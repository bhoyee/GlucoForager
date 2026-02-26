import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { addDebugLog } from './debugLogger';

const STORAGE_KEYS = {
  enabled: 'meal_reminders_enabled_v1',
  prompted: 'meal_reminders_prompted_v1',
  scheduledIds: 'meal_reminders_scheduled_ids_v1',
  times: 'meal_reminders_times_v1',
};

const DEFAULT_TIMES = {
  breakfast: { hour: 8, minute: 0 },
  lunch: { hour: 13, minute: 0 },
  dinner: { hour: 19, minute: 0 },
};

const ANDROID_CHANNEL_ID = 'meal-reminders';

function debugLog(message, details) {
  if (!__DEV__) return;
  try {
    // eslint-disable-next-line no-console
    console.log(`[MealReminders] ${message}`, details || '');
  } catch {
    // Ignore console errors.
  }
  try {
    addDebugLog({
      source: 'MealReminders',
      level: 'info',
      message,
      details: details ? JSON.stringify(details) : undefined,
    });
  } catch {
    // Ignore logger errors.
  }
}

async function readJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write errors.
  }
}

function normalizeTime(value, fallback) {
  const fallbackTime = fallback || { hour: 8, minute: 0 };
  const hourRaw = value?.hour;
  const minuteRaw = value?.minute;
  const hour = Number.isFinite(Number(hourRaw)) ? Number(hourRaw) : fallbackTime.hour;
  const minute = Number.isFinite(Number(minuteRaw)) ? Number(minuteRaw) : fallbackTime.minute;
  const safeHour = Math.min(23, Math.max(0, Math.floor(hour)));
  const safeMinute = Math.min(59, Math.max(0, Math.floor(minute)));
  return { hour: safeHour, minute: safeMinute };
}

export async function getMealReminderTimes() {
  const stored = await readJson(STORAGE_KEYS.times, null);
  if (!stored || typeof stored !== 'object') return DEFAULT_TIMES;
  const times = {
    breakfast: normalizeTime(stored.breakfast, DEFAULT_TIMES.breakfast),
    lunch: normalizeTime(stored.lunch, DEFAULT_TIMES.lunch),
    dinner: normalizeTime(stored.dinner, DEFAULT_TIMES.dinner),
  };
  debugLog('Loaded reminder times', times);
  return times;
}

export async function setMealReminderTimes(times) {
  const safeTimes = {
    breakfast: normalizeTime(times?.breakfast, DEFAULT_TIMES.breakfast),
    lunch: normalizeTime(times?.lunch, DEFAULT_TIMES.lunch),
    dinner: normalizeTime(times?.dinner, DEFAULT_TIMES.dinner),
  };
  debugLog('Saving reminder times', safeTimes);
  await writeJson(STORAGE_KEYS.times, safeTimes);
}

export async function getMealRemindersEnabled() {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEYS.enabled)) === '1';
  } catch {
    return false;
  }
}

export async function setMealRemindersEnabled(enabled) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.enabled, enabled ? '1' : '0');
    debugLog('Set enabled', { enabled });
  } catch {
    // Ignore.
  }
}

export async function getMealRemindersPrompted() {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEYS.prompted)) === '1';
  } catch {
    return false;
  }
}

export async function setMealRemindersPrompted() {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.prompted, '1');
    debugLog('Marked prompted');
  } catch {
    // Ignore.
  }
}

export function configureMealReminderNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Meal reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
      vibrationPattern: null,
      enableVibrate: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    debugLog('Ensured Android channel', { id: ANDROID_CHANNEL_ID });
  } catch {
    // Ignore.
  }
}

export async function requestMealReminderPermissions() {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing?.granted) return true;

    const requested = await Notifications.requestPermissionsAsync(
      Platform.OS === 'ios'
        ? { ios: { allowAlert: true, allowBadge: false, allowSound: false } }
        : undefined
    );
    debugLog('Requested notification permissions', { granted: requested?.granted });
    return Boolean(requested?.granted);
  } catch {
    return false;
  }
}

async function cancelScheduledMealReminders() {
  const ids = await readJson(STORAGE_KEYS.scheduledIds, []);
  if (!Array.isArray(ids) || ids.length === 0) return;
  debugLog('Cancelling scheduled reminders by IDs', { count: ids.length, ids });
  await Promise.allSettled(
    ids.map((id) => Notifications.cancelScheduledNotificationAsync(id))
  );
  await writeJson(STORAGE_KEYS.scheduledIds, []);
}

async function cancelOrphanedMealReminders() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (!Array.isArray(scheduled) || scheduled.length === 0) return;

    const mealReminderIds = scheduled
      .filter((item) => {
        const title = item?.content?.title || '';
        return typeof title === 'string' && title.toLowerCase().startsWith('time to scan for ');
      })
      .map((item) => item?.identifier)
      .filter(Boolean);

    await Promise.allSettled(
      mealReminderIds.map((id) => Notifications.cancelScheduledNotificationAsync(id))
    );
    if (mealReminderIds.length) {
      debugLog('Cancelled orphaned scheduled reminders', { count: mealReminderIds.length });
    }
  } catch {
    // Ignore.
  }
}

async function dismissPresentedMealReminders() {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    if (!Array.isArray(presented) || presented.length === 0) return;
    const ids = presented
      .filter((item) => {
        const title = item?.request?.content?.title || item?.content?.title || '';
        return typeof title === 'string' && title.toLowerCase().startsWith('time to scan for ');
      })
      .map((item) => item?.identifier)
      .filter(Boolean);
    await Promise.allSettled(ids.map((id) => Notifications.dismissNotificationAsync(id)));
    if (ids.length) {
      debugLog('Dismissed presented reminders', { count: ids.length });
    }
  } catch {
    // Ignore.
  }
}

export async function scheduleMealReminders(times = null) {
  const enabled = await getMealRemindersEnabled();
  if (!enabled) {
    debugLog('Schedule skipped (disabled)');
    return { scheduled: false, reason: 'disabled' };
  }

  const hasPermission = await requestMealReminderPermissions();
  if (!hasPermission) {
    debugLog('Schedule skipped (no permission)');
    return { scheduled: false, reason: 'no_permission' };
  }

  await ensureAndroidChannel();
  await cancelScheduledMealReminders();
  await cancelOrphanedMealReminders();
  await dismissPresentedMealReminders();

  const scheduleTimes = times || (await getMealReminderTimes());
  debugLog('Scheduling reminders', scheduleTimes);
  const pairs = [
    { key: 'breakfast', label: 'breakfast' },
    { key: 'lunch', label: 'lunch' },
    { key: 'dinner', label: 'dinner' },
  ];

  const ids = [];
  for (const item of pairs) {
    const triggerTime = scheduleTimes[item.key] || DEFAULT_TIMES[item.key];
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Time to scan for ${item.label}`,
        body: 'Scan ingredients to get diabetes-friendly recipes.',
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
      trigger:
        Platform.OS === 'android'
          ? {
              hour: triggerTime.hour,
              minute: triggerTime.minute,
              repeats: true,
            }
          : {
              hour: triggerTime.hour,
              minute: triggerTime.minute,
              repeats: true,
            },
    });
    ids.push(id);
  }

  await writeJson(STORAGE_KEYS.scheduledIds, ids);
  debugLog('Scheduled reminders', { count: ids.length, ids });
  return { scheduled: true };
}

export async function disableMealReminders() {
  debugLog('Disabling reminders');
  await setMealRemindersEnabled(false);
  await cancelScheduledMealReminders();
  await cancelOrphanedMealReminders();
  await dismissPresentedMealReminders();
}

export async function enableMealRemindersAndSchedule() {
  debugLog('Enabling reminders');
  await setMealRemindersEnabled(true);
  const times = await getMealReminderTimes();
  return scheduleMealReminders(times);
}

export async function syncMealRemindersOnAppStart() {
  const enabled = await getMealRemindersEnabled();
  if (!enabled) return;

  try {
    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions?.granted) return;
  } catch {
    return;
  }

  const times = await getMealReminderTimes();
  await ensureAndroidChannel();
  await cancelScheduledMealReminders();
  await cancelOrphanedMealReminders();
  await scheduleMealReminders(times);
}
